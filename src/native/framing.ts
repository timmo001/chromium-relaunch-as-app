import { readSync, writeSync } from "node:fs";
import { Effect, Schema } from "effect";

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

function readExact(
  fileDescriptor: number,
  size: number,
  allowCleanEof: boolean,
): Effect.Effect<Uint8Array | null, NativeMessageError> {
  return Effect.try({
    try: () => {
      const bytes = new Uint8Array(size);
      let offset = 0;

      while (offset < size) {
        const count = readSync(
          fileDescriptor,
          bytes,
          offset,
          size - offset,
          null,
        );
        if (count === 0) {
          if (allowCleanEof && offset === 0) return null;
          throw new Error(`Expected ${size} bytes, received ${offset}`);
        }
        offset += count;
      }

      return bytes;
    },
    catch: (cause) =>
      new NativeMessageError({ message: "Native message is truncated", cause }),
  });
}

export const readNativeMessage = Effect.fn("NativeMessaging.read")(function* (
  fileDescriptor = 0,
) {
  const header = yield* readExact(fileDescriptor, 4, true);
  if (header === null) return null;

  const length = new DataView(
    header.buffer,
    header.byteOffset,
    header.byteLength,
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

  const payload = yield* readExact(fileDescriptor, length, false);
  if (payload === null) {
    return yield* new NativeMessageError({
      message: "Native message payload is missing",
    });
  }

  return yield* Effect.try({
    try: () => {
      const parsed: unknown = JSON.parse(textDecoder.decode(payload));
      return parsed;
    },
    catch: (cause) =>
      new NativeMessageError({
        message: "Native message is not valid JSON",
        cause,
      }),
  });
});

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
  fileDescriptor = 1,
) {
  const frame = yield* encodeNativeMessage(message);
  yield* Effect.try({
    try: () => {
      let offset = 0;
      while (offset < frame.byteLength) {
        const count = writeSync(
          fileDescriptor,
          frame,
          offset,
          frame.byteLength - offset,
        );
        if (count === 0)
          throw new Error("Native response write made no progress");
        offset += count;
      }
    },
    catch: (cause) =>
      new NativeMessageError({
        message: "Failed to write native response",
        cause,
      }),
  });
});

export function logHostError(error: Error): void {
  process.stderr.write(`${error.message}\n`);
}
