import { homedir } from "node:os";
import { join } from "node:path";
import * as BunRuntime from "@effect/platform-bun/BunRuntime";
import { BunServices } from "@effect/platform-bun";
import { Effect, FileSystem, Schema } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
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

const executable = Effect.fn("RelaunchHost.executable")(function* (
  path: string | null | undefined,
) {
  if (!path) return false;
  const fs = yield* FileSystem.FileSystem;

  return yield* fs.stat(path).pipe(
    Effect.map((info) => info.type === "File" && (info.mode & 0o111) !== 0),
    Effect.orElseSucceed(() => false),
  );
});

export const resolveLauncher = Effect.fn("RelaunchHost.resolveLauncher")(
  function* () {
    const override = process.env.OMARCHY_LAUNCH_WEBAPP;
    const pathCommand = Bun.which("omarchy-launch-webapp");

    const fallback = join(
      homedir(),
      ".local/share/omarchy/bin/omarchy-launch-webapp",
    );

    for (const candidate of [override, pathCommand, fallback]) {
      if (candidate && (yield* executable(candidate))) return candidate;
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
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

  yield* spawner
    .spawn(
      ChildProcess.make(launcher, [url], {
        stdin: "ignore",
        stdout: "ignore",
        stderr: "ignore",
        detached: true,
      }),
    )
    .pipe(
      Effect.flatMap((child) => Effect.asVoid(child.unref)),
      Effect.scoped,
      Effect.mapError(
        (cause) =>
          new LaunchError({ message: "Failed to launch app window", cause }),
      ),
    );
});

export const runRelaunchHost = Effect.fn("RelaunchHost.run")(function* () {
  const request = yield* readNativeMessage;

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
      Effect.provide(BunServices.layer),
    ),
    { disableErrorReporting: true },
  );
}
