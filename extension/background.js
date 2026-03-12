const HOST_NAME = "dev.omarchy.relaunch_as_app";
const MENU_ID = "relaunch-as-app";
const SUPPORTED_PROTOCOLS = new Set(["http:", "https:"]);

function ensureContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create(
      {
        id: MENU_ID,
        title: "Relaunch This Page as App",
        contexts: ["page", "frame", "selection", "link", "editable", "image", "video", "audio"],
        documentUrlPatterns: ["http://*/*", "https://*/*"]
      },
      () => {
        if (chrome.runtime.lastError) {
          console.error("Failed to create context menu:", chrome.runtime.lastError.message);
        }
      }
    );
  });
}

chrome.runtime.onInstalled.addListener(() => {
  ensureContextMenu();
});

chrome.runtime.onStartup.addListener(() => {
  ensureContextMenu();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID) {
    return;
  }

  const url = info.pageUrl || tab?.url;

  if (!url) {
    console.error("No page URL was available for context-menu launch.");
    return;
  }

  try {
    const parsedUrl = new URL(url);

    if (!SUPPORTED_PROTOCOLS.has(parsedUrl.protocol)) {
      return;
    }

    const response = await chrome.runtime.sendNativeMessage(HOST_NAME, {
      url: parsedUrl.href
    });

    if (!response?.ok) {
      throw new Error(response?.error || "The native host did not confirm launch.");
    }

    if (typeof tab?.id === "number") {
      await chrome.tabs.remove(tab.id);
    }
  } catch (error) {
    console.error("Failed to relaunch page as app from the context menu.", error);
  }
});
