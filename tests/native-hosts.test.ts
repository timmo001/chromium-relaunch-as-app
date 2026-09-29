import { join } from "node:path";
import * as BunServices from "@effect/platform-bun/BunServices";
import { describe, expect, it } from "@effect/vitest";
import { Effect, FileSystem } from "effect";
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
    }).pipe(Effect.provide(BunServices.layer)),
  );
});

describe("browser URL state", () => {
  it.effect("atomically replaces the state file", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const directory = yield* fs.makeTempDirectoryScoped();
        const stateFile = join(directory, "state", "browser-urls.json");

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
        const stored: unknown = JSON.parse(yield* fs.readFileString(stateFile));
        expect(stored).toEqual([
          {
            windowId: 1,
            title: "Example",
            url: "https://example.com/",
            active: true,
          },
        ]);
      }),
    ).pipe(Effect.provide(BunServices.layer)),
  );

  it.effect("preserves the previous state after a filesystem failure", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const directory = yield* fs.makeTempDirectoryScoped();
        const blockedParent = join(directory, "not-a-directory");

        yield* fs.writeFileString(blockedParent, "existing");

        const error = yield* writeBrowserState(
          [],
          join(blockedParent, "state.json"),
        ).pipe(Effect.flip);

        expect(error._tag).toBe("StateWriteError");
        expect(yield* fs.readFileString(blockedParent)).toBe("existing");
      }),
    ).pipe(Effect.provide(BunServices.layer)),
  );
});
