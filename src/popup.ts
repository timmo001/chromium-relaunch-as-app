import { NativeResponse, RELAUNCH_HOST_NAME } from "./protocol.js";

const HOST_NAME = RELAUNCH_HOST_NAME;
const SUPPORTED_PROTOCOLS = new Set(["http:", "https:"]);

let activeTab: chrome.tabs.Tab | null = null;

function element<T extends HTMLElement>(
  id: string,
  constructor: abstract new (...args: never[]) => T,
): T {
  const value = document.getElementById(id);
  if (!(value instanceof constructor)) {
    throw new Error(`Missing or invalid element: #${id}`);
  }
  return value;
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

function setStatus(message: string, isError = false): void {
  const status = element("status", HTMLParagraphElement);
  status.textContent = message;
  status.dataset.state = isError ? "error" : "ready";
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

async function initializePopup(): Promise<void> {
  const title = element("page-title", HTMLHeadingElement);
  const url = element("page-url", HTMLParagraphElement);
  const button = element("launch-button", HTMLButtonElement);
  const form = element("launch-form", HTMLFormElement);

  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    activeTab = tab ?? null;

    if (!activeTab?.url) {
      setStatus("This page does not expose a launchable URL.", true);
      return;
    }

    const parsedUrl = new URL(activeTab.url);
    title.textContent = activeTab.title ?? parsedUrl.hostname;
    url.textContent = parsedUrl.href;

    if (!SUPPORTED_PROTOCOLS.has(parsedUrl.protocol)) {
      setStatus("Only http and https pages can be launched as apps.", true);
      return;
    }

    form.hidden = false;
    button.disabled = false;
    setStatus("Ready to launch.");
  } catch (error: unknown) {
    setStatus(
      getErrorMessage(error, "Failed to inspect the active tab."),
      true,
    );
  }
}

async function handleLaunch(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  const button = element("launch-button", HTMLButtonElement);
  const closeTab = element("close-tab", HTMLInputElement);

  if (!activeTab?.url) {
    setStatus("No active tab URL is available.", true);
    return;
  }

  button.disabled = true;
  setStatus("Launching app window...");

  try {
    const response: unknown = await chrome.runtime.sendNativeMessage(
      HOST_NAME,
      {
        url: activeTab.url,
      },
    );
    if (!isNativeResponse(response)) {
      throw new Error("The native host did not confirm launch.");
    }
    if (!response.ok) throw new Error(response.error);

    if (closeTab.checked && typeof activeTab.id === "number") {
      await chrome.tabs.remove(activeTab.id);
      window.close();
      return;
    }

    button.disabled = false;
    button.textContent = "Launch Again";
    setStatus("App window launched.");
  } catch (error: unknown) {
    button.disabled = false;
    setStatus(getErrorMessage(error, "Failed to launch the app window."), true);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  element("launch-form", HTMLFormElement).addEventListener(
    "submit",
    (event) => {
      void handleLaunch(event);
    },
  );
  void initializePopup();
});
