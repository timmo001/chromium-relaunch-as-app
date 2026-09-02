# Chromium Relaunch As App

> [!NOTE]
> This extension is built for [Omarchy](https://omarchy.org) users. It relies on the `omarchy-launch-webapp` command that ships with Omarchy.

Small Manifest V3 extension that launches the current page in an app window by calling `omarchy-launch-webapp "URL"` through a native messaging host.

## Files

- `src/` - strict TypeScript source for the extension and native tooling
- `extension/` - unpacked Chromium extension
- `dist/` - generated standalone native hosts and installer

## Install

1. Build the extension:

   ```bash
   mise run build
   ```

2. Install the native hosts for your browser:

   ```bash
   ./dist/install-native-host install chromium
   ```

   Supported values: `chromium`, `chrome`, `brave`, `edge`, `vivaldi`, `all`

3. Open `chrome://extensions` or `chromium://extensions`.
4. Enable Developer mode.
5. Click Load unpacked and choose `extension/`.
6. Pin the extension if you want one-click access.

## Native Hosts

The build creates three standalone executables:

- `dist/relaunch-current-page-host`
- `dist/browser-urls-host`
- `dist/install-native-host`

The installer copies the hosts to `${XDG_DATA_HOME:-~/.local/share}/chromium-relaunch-as-app/native-hosts` and writes browser manifests beneath `${XDG_CONFIG_HOME:-~/.config}`. The installed hosts include Bun and their production dependencies, so they do not require Bun, Node.js, `tsx`, or `node_modules` at runtime.

Install or refresh an existing installation:

```bash
./dist/install-native-host install chromium
./dist/install-native-host update chromium
```

Remove it:

```bash
./dist/install-native-host uninstall chromium
```

Use `all` instead of a browser name to target Chromium, Google Chrome, Brave, Microsoft Edge, and Vivaldi.

## Notes

- The popup and page context menu only enable launching for `http` and `https` pages.
- Launching from the page context menu closes the current tab after the app window opens.
- In app-style windows, the page context menu flips to reopening the page in a normal browser tab instead.
- The extension uses a fixed public key in `extension/manifest.json`, so the unpacked extension ID stays stable for the native host.
- Open tab state is written atomically to `${XDG_STATE_HOME:-~/.local/state}/browser-urls.json` for workspace capture tooling.
- Native host diagnostics are written to stderr. Stdout is reserved for Chromium's length-prefixed JSON protocol.
- Generated JavaScript under `extension/dist/` and executables under `dist/` are ignored. Run `mise run check` to lint, test, type-check, and rebuild them.
