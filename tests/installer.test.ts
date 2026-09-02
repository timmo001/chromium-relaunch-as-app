import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
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
  it.effect("installs and uninstalls every maintained browser manifest", () => {
    const root = mkdtempSync(join(tmpdir(), "native-installer-"));
    const paths = {
      configHome: join(root, "config"),
      dataHome: join(root, "data"),
      artifactDirectory: join(root, "artifacts"),
    };
    writeFileSync(join(root, "unrelated"), "keep");
    mkdirSync(paths.artifactDirectory, { recursive: true });
    writeFileSync(
      join(paths.artifactDirectory, "relaunch-current-page-host"),
      "relaunch",
    );
    writeFileSync(join(paths.artifactDirectory, "browser-urls-host"), "urls");

    return Effect.gen(function* () {
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
            readFileSync(join(directory, `${name}.json`), "utf8"),
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
      expect(existsSync(join(paths.dataHome, "chromium-relaunch-as-app"))).toBe(
        false,
      );
      expect(readFileSync(join(root, "unrelated"), "utf8")).toBe("keep");
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => rmSync(root, { recursive: true, force: true })),
      ),
    );
  });

  it.effect("fails when built host artifacts are missing", () => {
    const root = mkdtempSync(join(tmpdir(), "native-installer-missing-"));
    const paths = {
      configHome: join(root, "config"),
      dataHome: join(root, "data"),
      artifactDirectory: join(root, "missing"),
    };

    return Effect.gen(function* () {
      const error = yield* installNativeHosts("chromium", paths).pipe(
        Effect.flip,
      );
      expect(error._tag).toBe("InstallerError");
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => rmSync(root, { recursive: true, force: true })),
      ),
    );
  });
});
