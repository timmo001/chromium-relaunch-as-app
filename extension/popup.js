const HOST_NAME = "dev.omarchy.relaunch_as_app";
const SUPPORTED_PROTOCOLS = new Set(["http:", "https:"]);

let activeTab = null;

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("launch-form");

  form.addEventListener("submit", handleLaunch);
  initializePopup();
});

async function initializePopup() {
  const title = document.getElementById("page-title");
  const url = document.getElementById("page-url");
  const button = document.getElementById("launch-button");
  const form = document.getElementById("launch-form");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    activeTab = tab ?? null;

    if (!activeTab?.url) {
      setStatus("This page does not expose a launchable URL.", true);
      return;
    }

    const parsedUrl = new URL(activeTab.url);

    title.textContent = activeTab.title || parsedUrl.hostname;
    url.textContent = parsedUrl.href;

    if (!SUPPORTED_PROTOCOLS.has(parsedUrl.protocol)) {
      setStatus("Only http and https pages can be launched as apps.", true);
      return;
    }

    form.hidden = false;
    button.disabled = false;
    setStatus("Ready to launch.");
  } catch (error) {
    setStatus(getErrorMessage(error, "Failed to inspect the active tab."), true);
  }
}

async function handleLaunch(event) {
  event.preventDefault();

  const button = document.getElementById("launch-button");
  const closeTab = document.getElementById("close-tab");

  if (!activeTab?.url) {
    setStatus("No active tab URL is available.", true);
    return;
  }

  button.disabled = true;
  setStatus("Launching app window...");

  try {
    const response = await chrome.runtime.sendNativeMessage(HOST_NAME, {
      url: activeTab.url
    });

    if (!response?.ok) {
      throw new Error(response?.error || "The native host did not confirm launch.");
    }

    if (closeTab.checked && typeof activeTab.id === "number") {
      await chrome.tabs.remove(activeTab.id);
      window.close();
      return;
    }

    button.disabled = false;
    button.textContent = "Launch Again";
    setStatus("App window launched.");
  } catch (error) {
    button.disabled = false;
    setStatus(getErrorMessage(error, "Failed to launch the app window."), true);
  }
}

function setStatus(message, isError = false) {
  const status = document.getElementById("status");

  status.textContent = message;
  status.dataset.state = isError ? "error" : "ready";
}

function getErrorMessage(error, fallback) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}
