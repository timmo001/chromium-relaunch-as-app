import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import * as BunRuntime from "@effect/platform-bun/BunRuntime";
import { BunServices } from "@effect/platform-bun";
import { Effect, FileSystem, Schema, Stream } from "effect";
import { logHostError, nativeMessages } from "./framing.js";
import { BrowserTabStateSnapshot } from "./schemas.js";

export class StateWriteError extends Schema.TaggedError<StateWriteError>()(
  "StateWriteError",
  {
    message: Schema.String,
    cause: Schema.optionalKey(Schema.Defect()),
  },
) {}

export function defaultStateFile(): string {
  return join(
    process.env.XDG_STATE_HOME ?? join(homedir(), ".local/state"),
    "browser-urls.json",
  );
}

export const writeBrowserState = Effect.fn("BrowserUrlsHost.writeState")(
  function* (snapshot: ReadonlyArray<unknown>, stateFile = defaultStateFile()) {
    const directory = dirname(stateFile);

    const temporary = join(
      directory,
      `.browser-urls.${process.pid}.${randomUUID()}.tmp`,
    );

    const fs = yield* FileSystem.FileSystem;

    yield* fs.makeDirectory(directory, { recursive: true }).pipe(
      Effect.andThen(
        fs.writeFileString(
          temporary,
          `${JSON.stringify(snapshot, null, 2)}\n`,
          {
            flag: "wx",
            mode: 0o600,
          },
        ),
      ),
      Effect.andThen(fs.rename(temporary, stateFile)),
      Effect.onError(() =>
        // Preserve the original persistence failure.
        Effect.ignore(fs.remove(temporary, { force: true })),
      ),
      Effect.mapError(
        (cause) =>
          new StateWriteError({
            message: "Failed to persist browser URL state",
            cause,
          }),
      ),
    );
  },
);

export const runBrowserUrlsHost = Effect.fn("BrowserUrlsHost.run")(function* (
  stateFile = defaultStateFile(),
) {
  yield* nativeMessages.pipe(
    Stream.mapEffect((message) =>
      Schema.decodeUnknownEffect(BrowserTabStateSnapshot)(message).pipe(
        Effect.mapError(
          (cause) =>
            new StateWriteError({
              message: "Browser URL state is invalid",
              cause,
            }),
        ),
        Effect.flatMap((snapshot) => writeBrowserState(snapshot, stateFile)),
      ),
    ),
    Stream.runDrain,
  );
});

if (import.meta.main) {
  BunRuntime.runMain(
    runBrowserUrlsHost().pipe(
      Effect.tapError((error) => Effect.sync(() => logHostError(error))),
      Effect.provide(BunServices.layer),
    ),
    { disableErrorReporting: true },
  );
}
