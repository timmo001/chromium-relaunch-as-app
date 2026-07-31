const HOST_NAME = "dev.omarchy.relaunch_as_app";
const URLS_HOST_NAME = "dev.omarchy.browser_urls";
const MENU_ID = "relaunch-as-app";
const MENU_TITLE = "Show page as app/tab";
const SUPPORTED_PROTOCOLS = new Set(["http:", "https:"]);
const URLS_RECONNECT_DELAY_MS = 5000;

type ContextAction = "launchAsApp" | "reopenInBrowser";
type RelaunchSource = "context menu" | "keyboard shortcut";

interface NativeResponse {
  readonly ok: boolean;
  readonly error?: string;
}

interface BrowserTabState {
  readonly windowId: number | undefined;
  readonly title: string;
  readonly url: string;
  readonly active: boolean;
}

function isNativeResponse(value: unknown): value is NativeResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "ok" in value &&
    typeof value.ok === "boolean" &&
    (!("error" in value) || typeof value.error === "string")
  );
}

function ensureContextMenu(): void {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create(
      {
        id: MENU_ID,
        title: MENU_TITLE,
        contexts: [
          "page",
          "frame",
          "selection",
          "link",
          "editable",
          "image",
          "video",
          "audio",
        ],
        documentUrlPatterns: ["http://*/*", "https://*/*"],
      },
      () => {
        if (chrome.runtime.lastError) {
          console.error(
            "Failed to create context menu:",
            chrome.runtime.lastError.message,
          );
        }
      },
    );
  });
}

async function getContextAction(tab?: chrome.tabs.Tab): Promise<ContextAction> {
  if (typeof tab?.windowId !== "number") return "launchAsApp";

  try {
    const currentWindow = await chrome.windows.get(tab.windowId);
    return currentWindow.type === "normal" ? "launchAsApp" : "reopenInBrowser";
  } catch (error: unknown) {
    console.error("Failed to inspect the current window.", error);
    return "launchAsApp";
  }
}

async function reopenInBrowserTab(url: string): Promise<void> {
  const normalWindows = await chrome.windows.getAll({ windowTypes: ["normal"] });
  const targetWindow =
    normalWindows.find((windowInfo) => windowInfo.focused) ?? normalWindows[0];

  if (typeof targetWindow?.id === "number") {
    await chrome.tabs.create({ active: true, url, windowId: targetWindow.id });
    await chrome.windows.update(targetWindow.id, { focused: true });
    return;
  }

  await chrome.windows.create({ focused: true, url });
}

async function closeTab(tab?: chrome.tabs.Tab): Promise<void> {
  if (typeof tab?.id === "number") await chrome.tabs.remove(tab.id);
}

async function toggleRelaunch(
  url: string | undefined,
  tab: chrome.tabs.Tab | undefined,
  source: RelaunchSource,
): Promise<void> {
  if (!url) {
    console.error(`No page URL was available for ${source} launch.`);
    return;
  }

  try {
    const parsedUrl = new URL(url);
    if (!SUPPORTED_PROTOCOLS.has(parsedUrl.protocol)) return;

    if ((await getContextAction(tab)) === "reopenInBrowser") {
      await reopenInBrowserTab(parsedUrl.href);
      await closeTab(tab);
      return;
    }

    const response: unknown = await chrome.runtime.sendNativeMessage(HOST_NAME, {
      url: parsedUrl.href,
    });
    if (!isNativeResponse(response) || !response.ok) {
      throw new Error(
        isNativeResponse(response) && response.error
          ? response.error
          : "The native host did not confirm launch.",
      );
    }

    await closeTab(tab);
  } catch (error: unknown) {
    console.error(`Failed to relaunch page as app via ${source}.`, error);
  }
}

chrome.runtime.onInstalled.addListener(ensureContextMenu);
chrome.runtime.onStartup.addListener(ensureContextMenu);

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === MENU_ID) {
    await toggleRelaunch(info.pageUrl ?? tab?.url, tab, "context menu");
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-relaunch") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await toggleRelaunch(tab?.url, tab, "keyboard shortcut");
});

let urlsPort: chrome.runtime.Port | null = null;

function sendUrlState(): void {
  chrome.windows.getAll({ populate: true }, (windows) => {
    const data: BrowserTabState[] = windows.flatMap((windowInfo) =>
      (windowInfo.tabs ?? []).map((tab) => ({
        windowId: windowInfo.id,
        title: tab.title ?? "",
        url: tab.url ?? "",
        active: tab.active,
      })),
    );

    if (!urlsPort) return;
    try {
      urlsPort.postMessage(data);
    } catch {
      connectUrlsHost();
    }
  });
}

function connectUrlsHost(): void {
  if (urlsPort) {
    try {
      urlsPort.disconnect();
    } catch {
      // The port may already be disconnected.
    }
  }

  try {
    urlsPort = chrome.runtime.connectNative(URLS_HOST_NAME);
  } catch {
    setTimeout(connectUrlsHost, URLS_RECONNECT_DELAY_MS);
    return;
  }

  urlsPort.onDisconnect.addListener(() => {
    urlsPort = null;
    setTimeout(connectUrlsHost, URLS_RECONNECT_DELAY_MS);
  });
  sendUrlState();
}

chrome.tabs.onUpdated.addListener(sendUrlState);
chrome.tabs.onRemoved.addListener(sendUrlState);
chrome.tabs.onCreated.addListener(sendUrlState);
chrome.windows.onCreated.addListener(sendUrlState);
chrome.windows.onRemoved.addListener(sendUrlState);

connectUrlsHost();
