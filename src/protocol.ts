export const RELAUNCH_HOST_NAME = "dev.omarchy.relaunch_as_app";
export const BROWSER_URLS_HOST_NAME = "dev.omarchy.browser_urls";
export const EXTENSION_ID = "gmbhiemgnkapbblhoipdeiemfacjjoch";

export type NativeResponse =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: string };

export interface BrowserTabState {
  readonly windowId?: number;
  readonly title: string;
  readonly url: string;
  readonly active: boolean;
}
