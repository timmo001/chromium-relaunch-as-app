export const RELAUNCH_HOST_NAME = "dev.omarchy.relaunch_as_app";

export const BROWSER_URLS_HOST_NAME = "dev.omarchy.browser_urls";

export const EXTENSION_ID = "gmbhiemgnkapbblhoipdeiemfacjjoch";

export type NativeResponse =
  { readonly ok: true } | { readonly ok: false; readonly error: string };

export interface BrowserTabState {
  readonly windowId?: number;
  readonly title: string;
  readonly url: string;
  readonly active: boolean;
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Validates untyped runtime messages from the native host.
export function isNativeResponse(value: unknown): value is NativeResponse {
  return (
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Narrowing an untyped message; Effect would bloat the extension bundles.
    typeof value === "object" &&
    value !== null &&
    "ok" in value &&
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Narrowing an untyped message; Effect would bloat the extension bundles.
    typeof value.ok === "boolean" &&
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Narrowing an untyped message; Effect would bloat the extension bundles.
    (!("error" in value) || typeof value.error === "string")
  );
}
