import {
  closeSync,
  mkdtempSync,
  openSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import {
  MAX_INBOUND_MESSAGE_BYTES,
  encodeNativeMessage,
  readNativeMessage,
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

function withInput<A, E>(
  bytes: Uint8Array,
  use: (fileDescriptor: number) => Effect.Effect<A, E>,
): Effect.Effect<A, E> {
  const directory = mkdtempSync(join(tmpdir(), "native-framing-"));
  const path = join(directory, "input");
  writeFileSync(path, bytes);
  const fileDescriptor = openSync(path, "r");
  return use(fileDescriptor).pipe(
    Effect.ensuring(
      Effect.sync(() => {
        closeSync(fileDescriptor);
        rmSync(directory, { recursive: true });
      }),
    ),
  );
}

describe("native messaging framing", () => {
  it.effect("reads consecutive UTF-8 JSON messages", () => {
    const encoder = new TextEncoder();
    const first = framed(encoder.encode(JSON.stringify({ value: "£" })));
    const second = framed(encoder.encode(JSON.stringify([1, 2, 3])));
    const bytes = new Uint8Array(first.byteLength + second.byteLength);
    bytes.set(first);
    bytes.set(second, first.byteLength);

    return withInput(bytes, (fileDescriptor) =>
      Effect.gen(function* () {
        expect(yield* readNativeMessage(fileDescriptor)).toEqual({
          value: "£",
        });
        expect(yield* readNativeMessage(fileDescriptor)).toEqual([1, 2, 3]);
        expect(yield* readNativeMessage(fileDescriptor)).toBeNull();
      }),
    );
  });

  it.effect("rejects truncated headers and payloads", () =>
    Effect.gen(function* () {
      const headerError = yield* withInput(
        new Uint8Array([1, 0, 0]),
        (descriptor) => readNativeMessage(descriptor).pipe(Effect.flip),
      );
      expect(headerError._tag).toBe("NativeMessageError");
      expect(headerError.message).toBe("Native message is truncated");

      const payloadError = yield* withInput(
        framed(new TextEncoder().encode("{}"), 8),
        (descriptor) => readNativeMessage(descriptor).pipe(Effect.flip),
      );
      expect(payloadError.message).toBe("Native message is truncated");
    }),
  );

  it.effect("rejects zero-length, oversized, and malformed messages", () =>
    Effect.gen(function* () {
      const zero = yield* withInput(framed(new Uint8Array(), 0), (descriptor) =>
        readNativeMessage(descriptor).pipe(Effect.flip),
      );
      expect(zero.message).toContain("cannot be empty");

      const oversized = yield* withInput(
        framed(new Uint8Array(), MAX_INBOUND_MESSAGE_BYTES + 1),
        (descriptor) => readNativeMessage(descriptor).pipe(Effect.flip),
      );
      expect(oversized.message).toContain("exceeds");

      const malformed = yield* withInput(
        framed(new TextEncoder().encode("{")),
        (descriptor) => readNativeMessage(descriptor).pipe(Effect.flip),
      );
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
