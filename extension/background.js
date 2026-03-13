const HOST_NAME = "dev.omarchy.relaunch_as_app";
const MENU_ID = "relaunch-as-app";
const MENU_TITLE = "Show page as app/tab";
const SUPPORTED_PROTOCOLS = new Set(["http:", "https:"]);

function ensureContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create(
      {
        id: MENU_ID,
        title: MENU_TITLE,
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

async function getContextAction(tab) {
  if (typeof tab?.windowId !== "number") {
    return "launchAsApp";
  }

  try {
    const currentWindow = await chrome.windows.get(tab.windowId);
    return currentWindow.type === "normal" ? "launchAsApp" : "reopenInBrowser";
  } catch (error) {
    console.error("Failed to inspect the current window.", error);
    return "launchAsApp";
  }
}

async function reopenInBrowserTab(url) {
  const normalWindows = await chrome.windows.getAll({ windowTypes: ["normal"] });
  const targetWindow = normalWindows.find((windowInfo) => windowInfo.focused) || normalWindows[0];

  if (typeof targetWindow?.id === "number") {
    await chrome.tabs.create({
      active: true,
      url,
      windowId: targetWindow.id
    });
    await chrome.windows.update(targetWindow.id, { focused: true });
    return;
  }

  await chrome.windows.create({ focused: true, url });
}

async function closeTab(tab) {
  if (typeof tab?.id === "number") {
    await chrome.tabs.remove(tab.id);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  ensureContextMenu();
});

chrome.runtime.onStartup.addListener(() => {
  ensureContextMenu();
});

async function toggleRelaunch(url, tab, source) {
  if (!url) {
    console.error(`No page URL was available for ${source} launch.`);
    return;
  }

  try {
    const parsedUrl = new URL(url);

    if (!SUPPORTED_PROTOCOLS.has(parsedUrl.protocol)) {
      return;
    }

    const action = await getContextAction(tab);

    if (action === "reopenInBrowser") {
      await reopenInBrowserTab(parsedUrl.href);
      await closeTab(tab);
      return;
    }

    const response = await chrome.runtime.sendNativeMessage(HOST_NAME, {
      url: parsedUrl.href
    });

    if (!response?.ok) {
      throw new Error(response?.error || "The native host did not confirm launch.");
    }

    await closeTab(tab);
  } catch (error) {
    console.error(`Failed to relaunch page as app via ${source}.`, error);
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID) {
    return;
  }

  const url = info.pageUrl || tab?.url;
  await toggleRelaunch(url, tab, "context menu");
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-relaunch") {
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url;
  await toggleRelaunch(url, tab, "keyboard shortcut");
});
