import { Effect, Schema } from "effect";

export const RelaunchRequest = Schema.Struct({
  url: Schema.NonEmptyString,
});

export const BrowserTabStateSnapshot = Schema.Array(
  Schema.Struct({
    windowId: Schema.optionalKey(Schema.Int),
    title: Schema.String,
    url: Schema.String,
    active: Schema.Boolean,
  }),
);

export class InvalidUrl extends Schema.TaggedError<InvalidUrl>()("InvalidUrl", {
  message: Schema.String,
}) {}

export const decodeLaunchUrl = Effect.fn("Protocol.decodeLaunchUrl")(function* (
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- This is the untrusted native-message boundary.
  input: unknown,
) {
  const request = yield* Schema.decodeUnknownEffect(RelaunchRequest)(
    input,
  ).pipe(
    Effect.mapError(
      () =>
        new InvalidUrl({
          message: "Request must include a non-empty url string",
        }),
    ),
  );
  const parsed = yield* Effect.try({
    try: () => new URL(request.url),
    catch: () => new InvalidUrl({ message: "URL is invalid" }),
  });

  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.hostname === ""
  ) {
    return yield* new InvalidUrl({
      message: "Only http and https URLs with a host can be launched",
    });
  }

  return parsed.href;
});
