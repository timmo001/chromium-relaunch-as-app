import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { writeBrowserState } from "../src/native/browser-urls-host.js";
import { launchUrl } from "../src/native/relaunch-host.js";
import { decodeLaunchUrl } from "../src/native/schemas.js";

describe("relaunch host", () => {
  it.effect("canonicalises HTTP URLs", () =>
    Effect.gen(function* () {
      expect(yield* decodeLaunchUrl({ url: "https://example.com/a b" })).toBe(
        "https://example.com/a%20b",
      );
    }),
  );

  it.effect("rejects malformed requests and unsupported URL schemes", () =>
    Effect.gen(function* () {
      const missing = yield* decodeLaunchUrl({}).pipe(Effect.flip);
      expect(missing.message).toContain("non-empty url");

      const file = yield* decodeLaunchUrl({ url: "file:///tmp/example" }).pipe(
        Effect.flip,
      );
      expect(file.message).toContain("http and https");
    }),
  );

  it.effect("reports subprocess failures", () =>
    Effect.gen(function* () {
      const error = yield* launchUrl(
        "/path/that/does/not/exist/omarchy-launch-webapp",
        "https://example.com/",
      ).pipe(Effect.flip);
      expect(error._tag).toBe("LaunchError");
    }),
  );
});

describe("browser URL state", () => {
  it.effect("atomically replaces the state file", () => {
    const directory = mkdtempSync(join(tmpdir(), "browser-state-"));
    const stateFile = join(directory, "state", "browser-urls.json");

    return Effect.gen(function* () {
      yield* writeBrowserState(
        [
          {
            windowId: 1,
            title: "Example",
            url: "https://example.com/",
            active: true,
          },
        ],
        stateFile,
      );
      const stored: unknown = JSON.parse(readFileSync(stateFile, "utf8"));
      expect(stored).toEqual([
        {
          windowId: 1,
          title: "Example",
          url: "https://example.com/",
          active: true,
        },
      ]);
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => rmSync(directory, { recursive: true, force: true })),
      ),
    );
  });

  it.effect("preserves the previous state after a filesystem failure", () => {
    const directory = mkdtempSync(join(tmpdir(), "browser-state-failure-"));
    const blockedParent = join(directory, "not-a-directory");
    writeFileSync(blockedParent, "existing");

    return Effect.gen(function* () {
      const error = yield* writeBrowserState(
        [],
        join(blockedParent, "state.json"),
      ).pipe(Effect.flip);
      expect(error._tag).toBe("StateWriteError");
      expect(readFileSync(blockedParent, "utf8")).toBe("existing");
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => rmSync(directory, { recursive: true, force: true })),
      ),
    );
  });
});
