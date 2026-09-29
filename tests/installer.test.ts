import { join } from "node:path";
import * as BunServices from "@effect/platform-bun/BunServices";
import { describe, expect, it } from "@effect/vitest";
import { Effect, FileSystem } from "effect";
import {
  installNativeHosts,
  uninstallNativeHosts,
} from "../src/native/install-native-host.js";
import {
  BROWSER_URLS_HOST_NAME,
  EXTENSION_ID,
  RELAUNCH_HOST_NAME,
} from "../src/protocol.js";

describe("native host installer", () => {
  it.effect("installs and uninstalls every maintained browser manifest", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const root = yield* fs.makeTempDirectoryScoped();

        const paths = {
          configHome: join(root, "config"),
          dataHome: join(root, "data"),
          artifactDirectory: join(root, "artifacts"),
        };

        yield* fs.writeFileString(join(root, "unrelated"), "keep");
        yield* fs.makeDirectory(paths.artifactDirectory, { recursive: true });
        yield* fs.writeFileString(
          join(paths.artifactDirectory, "relaunch-current-page-host"),
          "relaunch",
        );
        yield* fs.writeFileString(
          join(paths.artifactDirectory, "browser-urls-host"),
          "urls",
        );

        yield* installNativeHosts("all", paths);

        const browserDirectories = [
          "chromium",
          "google-chrome",
          "BraveSoftware/Brave-Browser",
          "microsoft-edge",
          "vivaldi",
        ];

        for (const browser of browserDirectories) {
          const directory = join(
            paths.configHome,
            browser,
            "NativeMessagingHosts",
          );

          for (const name of [RELAUNCH_HOST_NAME, BROWSER_URLS_HOST_NAME]) {
            const manifest: unknown = JSON.parse(
              yield* fs.readFileString(join(directory, `${name}.json`)),
            );

            expect(manifest).toMatchObject({
              name,
              type: "stdio",
              allowed_origins: [`chrome-extension://${EXTENSION_ID}/`],
            });
          }
        }

        yield* installNativeHosts("all", paths);
        yield* uninstallNativeHosts("all", paths);
        expect(
          yield* fs.exists(join(paths.dataHome, "chromium-relaunch-as-app")),
        ).toBe(false);
        expect(yield* fs.readFileString(join(root, "unrelated"))).toBe("keep");
      }),
    ).pipe(Effect.provide(BunServices.layer)),
  );

  it.effect("fails when built host artifacts are missing", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const root = yield* fs.makeTempDirectoryScoped();

        const paths = {
          configHome: join(root, "config"),
          dataHome: join(root, "data"),
          artifactDirectory: join(root, "missing"),
        };

        const error = yield* installNativeHosts("chromium", paths).pipe(
          Effect.flip,
        );

        expect(error._tag).toBe("InstallerError");
      }),
    ).pipe(Effect.provide(BunServices.layer)),
  );
});
