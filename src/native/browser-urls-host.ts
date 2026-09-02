import {
  closeSync,
  mkdirSync,
  openSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import * as BunRuntime from "@effect/platform-bun/BunRuntime";
import { Effect, Schema } from "effect";
import { logHostError, readNativeMessage } from "./framing.js";
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

    yield* Effect.try({
      try: () => {
        mkdirSync(directory, { recursive: true });
        const descriptor = openSync(temporary, "wx", 0o600);
        try {
          writeFileSync(descriptor, `${JSON.stringify(snapshot, null, 2)}\n`);
        } finally {
          closeSync(descriptor);
        }
        renameSync(temporary, stateFile);
      },
      catch: (cause) => {
        try {
          rmSync(temporary, { force: true });
        } catch {
          // Preserve the original persistence failure.
        }
        return new StateWriteError({
          message: "Failed to persist browser URL state",
          cause,
        });
      },
    });
  },
);

export const runBrowserUrlsHost = Effect.fn("BrowserUrlsHost.run")(function* (
  stateFile = defaultStateFile(),
) {
  while (true) {
    const message = yield* readNativeMessage();
    if (message === null) return;
    const snapshot = yield* Schema.decodeUnknownEffect(BrowserTabStateSnapshot)(
      message,
    ).pipe(
      Effect.mapError(
        (cause) =>
          new StateWriteError({
            message: "Browser URL state is invalid",
            cause,
          }),
      ),
    );
    yield* writeBrowserState(snapshot, stateFile);
  }
});

if (import.meta.main) {
  BunRuntime.runMain(
    runBrowserUrlsHost().pipe(
      Effect.tapError((error) => Effect.sync(() => logHostError(error))),
    ),
    { disableErrorReporting: true },
  );
}
