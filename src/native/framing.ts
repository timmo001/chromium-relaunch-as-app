import { Effect, Option, Schema, Stdio, Stream } from "effect";

export const MAX_INBOUND_MESSAGE_BYTES = 64 * 1024 * 1024;

export const MAX_OUTBOUND_MESSAGE_BYTES = 1024 * 1024;

const nativeLittleEndian = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

const textDecoder = new TextDecoder("utf-8", { fatal: true });

const textEncoder = new TextEncoder();

export class NativeMessageError extends Schema.TaggedError<NativeMessageError>()(
  "NativeMessageError",
  {
    message: Schema.String,
    cause: Schema.optionalKey(Schema.Defect()),
  },
) {}

const parseFrames = (
  buffer: Uint8Array,
): Effect.Effect<
  readonly [rest: Uint8Array, messages: ReadonlyArray<unknown>],
  NativeMessageError
> =>
  Effect.gen(function* () {
    const messages: Array<unknown> = [];
    let rest = buffer;

    while (rest.byteLength >= 4) {
      const length = new DataView(
        rest.buffer,
        rest.byteOffset,
        rest.byteLength,
      ).getUint32(0, nativeLittleEndian);

      if (length === 0) {
        return yield* new NativeMessageError({
          message: "Native message payload cannot be empty",
        });
      }

      if (length > MAX_INBOUND_MESSAGE_BYTES) {
        return yield* new NativeMessageError({
          message: `Native message exceeds ${MAX_INBOUND_MESSAGE_BYTES} bytes`,
        });
      }

      if (rest.byteLength < 4 + length) break;

      const payload = rest.subarray(4, 4 + length);
      rest = rest.subarray(4 + length);

      messages.push(
        yield* Effect.try({
          try: () => {
            const parsed: unknown = JSON.parse(textDecoder.decode(payload));

            return parsed;
          },
          catch: (cause) =>
            new NativeMessageError({
              message: "Native message is not valid JSON",
              cause,
            }),
        }),
      );
    }

    return [rest, messages] as const;
  });

export const decodeNativeMessages = <E>(
  bytes: Stream.Stream<Uint8Array, E>,
): Stream.Stream<unknown, NativeMessageError> =>
  bytes.pipe(
    Stream.mapError(
      (cause) =>
        new NativeMessageError({
          message: "Failed to read native message",
          cause,
        }),
    ),
    Stream.map(Option.some),
    Stream.concat(Stream.make(Option.none<Uint8Array>())),
    Stream.mapAccumEffect(
      (): Uint8Array => new Uint8Array(),
      (buffered, chunk) => {
        if (Option.isNone(chunk)) {
          return buffered.byteLength === 0
            ? Effect.succeed([buffered, []] as const)
            : Effect.fail(
                new NativeMessageError({
                  message: "Native message is truncated",
                }),
              );
        }

        const combined = new Uint8Array(
          buffered.byteLength + chunk.value.byteLength,
        );

        combined.set(buffered);
        combined.set(chunk.value, buffered.byteLength);

        return parseFrames(combined);
      },
    ),
  );

export const nativeMessages: Stream.Stream<
  unknown,
  NativeMessageError,
  Stdio.Stdio
> = Stream.unwrap(
  Effect.map(Stdio.Stdio, (stdio) => decodeNativeMessages(stdio.stdin)),
);

export const readNativeMessage = nativeMessages.pipe(
  Stream.take(1),
  Stream.runHead,
  Effect.map(Option.getOrNull),
);

export const encodeNativeMessage = Effect.fn("NativeMessaging.encode")(
  function* (
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- JSON serialization is the output boundary.
    message: unknown,
  ) {
    const payload = yield* Effect.try({
      try: () => textEncoder.encode(JSON.stringify(message)),
      catch: (cause) =>
        new NativeMessageError({
          message: "Native response is not serializable",
          cause,
        }),
    });

    if (payload.byteLength > MAX_OUTBOUND_MESSAGE_BYTES) {
      return yield* new NativeMessageError({
        message: `Native response exceeds ${MAX_OUTBOUND_MESSAGE_BYTES} bytes`,
      });
    }

    const frame = new Uint8Array(4 + payload.byteLength);
    new DataView(frame.buffer).setUint32(
      0,
      payload.byteLength,
      nativeLittleEndian,
    );
    frame.set(payload, 4);

    return frame;
  },
);

export const writeNativeMessage = Effect.fn("NativeMessaging.write")(function* (
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- JSON serialization is the output boundary.
  message: unknown,
) {
  const frame = yield* encodeNativeMessage(message);
  const stdio = yield* Stdio.Stdio;

  yield* Stream.make(frame).pipe(
    Stream.run(stdio.stdout({ endOnDone: false })),
    Effect.mapError(
      (cause) =>
        new NativeMessageError({
          message: "Failed to write native response",
          cause,
        }),
    ),
  );
});

export function logHostError(error: Error): void {
  process.stderr.write(`${error.message}\n`);
}
