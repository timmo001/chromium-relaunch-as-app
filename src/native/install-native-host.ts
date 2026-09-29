import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import * as BunRuntime from "@effect/platform-bun/BunRuntime";
import * as BunServices from "@effect/platform-bun/BunServices";
import { Effect, FileSystem, Schema } from "effect";
import {
  BROWSER_URLS_HOST_NAME,
  EXTENSION_ID,
  RELAUNCH_HOST_NAME,
} from "../protocol.js";

const browserDirectories = {
  chromium: "chromium/NativeMessagingHosts",
  chrome: "google-chrome/NativeMessagingHosts",
  brave: "BraveSoftware/Brave-Browser/NativeMessagingHosts",
  edge: "microsoft-edge/NativeMessagingHosts",
  vivaldi: "vivaldi/NativeMessagingHosts",
} as const;

const browsers: ReadonlyArray<Browser> = [
  "chromium",
  "chrome",
  "brave",
  "edge",
  "vivaldi",
];

type Browser = keyof typeof browserDirectories;

type Action = "install" | "update" | "uninstall";

const hostFiles = [
  {
    name: RELAUNCH_HOST_NAME,
    executable: "relaunch-current-page-host",
    description:
      "Launch the current page in an app window via omarchy-launch-webapp.",
  },
  {
    name: BROWSER_URLS_HOST_NAME,
    executable: "browser-urls-host",
    description: "Track open tab URLs for external tools.",
  },
] as const;

export class InstallerError extends Schema.TaggedError<InstallerError>()(
  "InstallerError",
  {
    message: Schema.String,
    cause: Schema.optionalKey(Schema.Defect()),
  },
) {}

export interface InstallPaths {
  readonly configHome: string;
  readonly dataHome: string;
  readonly artifactDirectory: string;
}

export function defaultInstallPaths(): InstallPaths {
  return {
    configHome: process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
    dataHome: process.env.XDG_DATA_HOME ?? join(homedir(), ".local/share"),
    artifactDirectory: dirname(process.execPath),
  };
}

function selectedBrowsers(browser: Browser | "all"): ReadonlyArray<Browser> {
  return browser === "all" ? browsers : [browser];
}

const atomicCopy = Effect.fn("NativeHostInstaller.atomicCopy")(function* (
  source: string,
  destination: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const temporary = `${destination}.${process.pid}.tmp`;

  yield* fs.copyFile(source, temporary).pipe(
    Effect.andThen(fs.chmod(temporary, 0o755)),
    Effect.andThen(fs.rename(temporary, destination)),
    Effect.onError(() => Effect.ignore(fs.remove(temporary, { force: true }))),
  );
});

interface NativeHostManifest {
  readonly name: string;
  readonly description: string;
  readonly path: string;
  readonly type: "stdio";
  readonly allowed_origins: ReadonlyArray<string>;
}

const atomicWriteJson = Effect.fn("NativeHostInstaller.atomicWriteJson")(
  function* (destination: string, value: NativeHostManifest) {
    const fs = yield* FileSystem.FileSystem;
    const temporary = `${destination}.${process.pid}.tmp`;

    yield* fs
      .writeFileString(temporary, `${JSON.stringify(value, null, 2)}\n`, {
        mode: 0o644,
        flag: "wx",
      })
      .pipe(
        Effect.andThen(fs.rename(temporary, destination)),
        Effect.onError(() =>
          Effect.ignore(fs.remove(temporary, { force: true })),
        ),
      );
  },
);

export const installNativeHosts = Effect.fn("NativeHostInstaller.install")(
  function* (browser: Browser | "all", paths = defaultInstallPaths()) {
    const fs = yield* FileSystem.FileSystem;

    yield* Effect.gen(function* () {
      const installDirectory = join(
        paths.dataHome,
        "chromium-relaunch-as-app/native-hosts",
      );

      yield* fs.makeDirectory(installDirectory, { recursive: true });

      for (const host of hostFiles) {
        const source = join(paths.artifactDirectory, host.executable);

        if (!(yield* fs.exists(source))) {
          return yield* new InstallerError({
            message: `Built native host not found: ${source}`,
          });
        }

        yield* atomicCopy(source, join(installDirectory, host.executable));
      }

      for (const selected of selectedBrowsers(browser)) {
        const manifestDirectory = join(
          paths.configHome,
          browserDirectories[selected],
        );

        yield* fs.makeDirectory(manifestDirectory, { recursive: true });

        for (const host of hostFiles) {
          yield* atomicWriteJson(join(manifestDirectory, `${host.name}.json`), {
            name: host.name,
            description: host.description,
            path: join(installDirectory, host.executable),
            type: "stdio",
            allowed_origins: [`chrome-extension://${EXTENSION_ID}/`],
          });
        }
      }
    }).pipe(
      Effect.mapError((cause) =>
        cause instanceof InstallerError
          ? cause
          : new InstallerError({
              message: "Failed to install native hosts",
              cause,
            }),
      ),
    );
  },
);

export const uninstallNativeHosts = Effect.fn("NativeHostInstaller.uninstall")(
  function* (browser: Browser | "all", paths = defaultInstallPaths()) {
    const fs = yield* FileSystem.FileSystem;

    yield* Effect.gen(function* () {
      for (const selected of selectedBrowsers(browser)) {
        const manifestDirectory = join(
          paths.configHome,
          browserDirectories[selected],
        );

        for (const host of hostFiles) {
          yield* fs.remove(join(manifestDirectory, `${host.name}.json`), {
            force: true,
          });
        }
      }

      let manifestsRemain = false;

      for (const directory of Object.values(browserDirectories)) {
        for (const host of hostFiles) {
          if (
            yield* fs.exists(
              join(paths.configHome, directory, `${host.name}.json`),
            )
          ) {
            manifestsRemain = true;
          }
        }
      }

      if (!manifestsRemain) {
        yield* fs.remove(join(paths.dataHome, "chromium-relaunch-as-app"), {
          recursive: true,
          force: true,
        });
      }
    }).pipe(
      Effect.mapError(
        (cause) =>
          new InstallerError({
            message: "Failed to uninstall native hosts",
            cause,
          }),
      ),
    );
  },
);

function parseArguments(args: ReadonlyArray<string>):
  | { readonly help: true }
  | {
      readonly help: false;
      readonly action: Action;
      readonly browser: Browser | "all";
    } {
  if (args.includes("--help") || args.includes("-h")) return { help: true };

  const action = args[0] ?? "install";
  const browser = args[1] ?? "chromium";

  if (action !== "install" && action !== "update" && action !== "uninstall") {
    throw new Error(`Unsupported action: ${action}`);
  }

  switch (browser) {
    case "all":
    case "chromium":
    case "chrome":
    case "brave":
    case "edge":
    case "vivaldi":
      return { help: false, action, browser };
    default:
      throw new Error(`Unsupported browser: ${browser}`);
  }
}

function usage(): string {
  return `Usage: ${basename(process.argv[0] ?? "install-native-host")} [install|update|uninstall] [chromium|chrome|brave|edge|vivaldi|all]`;
}

if (import.meta.main) {
  const program = Effect.try({
    try: () => parseArguments(process.argv.slice(2)),
    catch: (cause) => new InstallerError({ message: usage(), cause }),
  }).pipe(
    Effect.flatMap((arguments_) => {
      if (arguments_.help) return Effect.sync(() => console.log(usage()));

      const operation =
        arguments_.action === "uninstall"
          ? uninstallNativeHosts(arguments_.browser)
          : installNativeHosts(arguments_.browser);

      return operation.pipe(
        Effect.tap(() =>
          Effect.sync(() =>
            console.log(
              `${arguments_.action === "uninstall" ? "Uninstalled" : "Installed"} native hosts for ${arguments_.browser}`,
            ),
          ),
        ),
      );
    }),
    Effect.catch((error) =>
      Effect.sync(() => {
        console.error(error.message);
        process.exitCode = 1;
      }),
    ),
  );

  BunRuntime.runMain(program.pipe(Effect.provide(BunServices.layer)), {
    disableErrorReporting: true,
  });
}
