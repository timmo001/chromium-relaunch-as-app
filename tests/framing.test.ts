import { describe, expect, it } from "@effect/vitest";
import { Effect, Stream } from "effect";
import {
  MAX_INBOUND_MESSAGE_BYTES,
  encodeNativeMessage,
  decodeNativeMessages,
} from "../src/native/framing.js";

const littleEndian = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

function framed(
  payload: Uint8Array,
  declaredLength = payload.byteLength,
): Uint8Array {
  const frame = new Uint8Array(4 + payload.byteLength);
  new DataView(frame.buffer).setUint32(0, declaredLength, littleEndian);
  frame.set(payload, 4);

  return frame;
}

const readFirst = (bytes: Uint8Array) =>
  decodeNativeMessages(Stream.make(bytes)).pipe(Stream.runCollect);

describe("native messaging framing", () => {
  it.effect("reads consecutive UTF-8 JSON messages", () => {
    const encoder = new TextEncoder();
    const first = framed(encoder.encode(JSON.stringify({ value: "£" })));
    const second = framed(encoder.encode(JSON.stringify([1, 2, 3])));
    const bytes = new Uint8Array(first.byteLength + second.byteLength);
    bytes.set(first);
    bytes.set(second, first.byteLength);

    return Effect.gen(function* () {
      const messages = yield* readFirst(bytes);

      expect(Array.from(messages)).toEqual([{ value: "£" }, [1, 2, 3]]);
    });
  });

  it.effect("rejects truncated headers and payloads", () =>
    Effect.gen(function* () {
      const headerError = yield* readFirst(new Uint8Array([1, 0, 0])).pipe(
        Effect.flip,
      );

      expect(headerError._tag).toBe("NativeMessageError");
      expect(headerError.message).toBe("Native message is truncated");

      const payloadError = yield* readFirst(
        framed(new TextEncoder().encode("{}"), 8),
      ).pipe(Effect.flip);

      expect(payloadError.message).toBe("Native message is truncated");
    }),
  );

  it.effect("rejects zero-length, oversized, and malformed messages", () =>
    Effect.gen(function* () {
      const zero = yield* readFirst(framed(new Uint8Array(), 0)).pipe(
        Effect.flip,
      );

      expect(zero.message).toContain("cannot be empty");

      const oversized = yield* readFirst(
        framed(new Uint8Array(), MAX_INBOUND_MESSAGE_BYTES + 1),
      ).pipe(Effect.flip);

      expect(oversized.message).toContain("exceeds");

      const malformed = yield* readFirst(
        framed(new TextEncoder().encode("{")),
      ).pipe(Effect.flip);

      expect(malformed.message).toBe("Native message is not valid JSON");
    }),
  );

  it.effect("rejects responses larger than Chromium's one MiB limit", () =>
    Effect.gen(function* () {
      const error = yield* encodeNativeMessage("x".repeat(1024 * 1024)).pipe(
        Effect.flip,
      );

      expect(error.message).toContain("1048576");
    }),
  );
});
