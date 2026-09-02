import { accessSync, constants, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as BunRuntime from "@effect/platform-bun/BunRuntime";
import { Effect, Schema } from "effect";
import {
  logHostError,
  readNativeMessage,
  writeNativeMessage,
} from "./framing.js";
import { decodeLaunchUrl } from "./schemas.js";

export class LaunchError extends Schema.TaggedError<LaunchError>()(
  "LaunchError",
  {
    message: Schema.String,
    cause: Schema.optionalKey(Schema.Defect()),
  },
) {}

function executable(path: string | null | undefined): path is string {
  if (!path) return false;
  try {
    return statSync(path).isFile() && (accessSync(path, constants.X_OK), true);
  } catch {
    return false;
  }
}

export const resolveLauncher = Effect.fn("RelaunchHost.resolveLauncher")(
  function* () {
    const override = process.env.OMARCHY_LAUNCH_WEBAPP;
    const pathCommand = Bun.which("omarchy-launch-webapp");
    const fallback = join(
      homedir(),
      ".local/share/omarchy/bin/omarchy-launch-webapp",
    );

    for (const candidate of [override, pathCommand, fallback]) {
      if (executable(candidate)) return candidate;
    }

    return yield* new LaunchError({
      message: "Could not find omarchy-launch-webapp",
    });
  },
);

export const launchUrl = Effect.fn("RelaunchHost.launchUrl")(function* (
  launcher: string,
  url: string,
) {
  yield* Effect.try({
    try: () => {
      const subprocess = Bun.spawn([launcher, url], {
        stdin: "ignore",
        stdout: "ignore",
        stderr: "ignore",
        detached: true,
      });
      subprocess.unref();
    },
    catch: (cause) =>
      new LaunchError({ message: "Failed to launch app window", cause }),
  });
});

export const runRelaunchHost = Effect.fn("RelaunchHost.run")(function* () {
  const request = yield* readNativeMessage();
  if (request === null) {
    return yield* new LaunchError({ message: "No native message received" });
  }
  const url = yield* decodeLaunchUrl(request);
  const launcher = yield* resolveLauncher();
  yield* launchUrl(launcher, url);
  yield* writeNativeMessage({ ok: true });
});

if (import.meta.main) {
  BunRuntime.runMain(
    runRelaunchHost().pipe(
      Effect.catch((error) =>
        writeNativeMessage({ ok: false, error: error.message }).pipe(
          Effect.tap(() => Effect.sync(() => logHostError(error))),
          Effect.tap(() => Effect.sync(() => (process.exitCode = 1))),
          Effect.catch((writeError) =>
            Effect.sync(() => {
              logHostError(writeError);
              process.exitCode = 1;
            }),
          ),
        ),
      ),
    ),
    { disableErrorReporting: true },
  );
}
