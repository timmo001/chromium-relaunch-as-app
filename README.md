# Chromium Relaunch As App

> [!NOTE]
> This extension is built for [Omarchy](https://omarchy.org) users. It relies on the `omarchy-launch-webapp` command that ships with Omarchy.

Small Manifest V3 extension that launches the current page in an app window by calling `omarchy-launch-webapp --app "URL"` through a native messaging host.

## Files

- `extension/` - unpacked Chrome/Chromium extension
- `src/` - strict TypeScript source compiled into `extension/`
- `native_host/` - Python native messaging host that spawns `omarchy-launch-webapp`
- `scripts/install-native-host.sh` - installs the native host manifest for a browser profile

## Install

1. Build the extension:

   ```bash
   mise run build
   ```

2. Install the native host manifest for your browser:

   ```bash
   ./scripts/install-native-host.sh chromium
   ```

   Supported values: `chromium`, `chrome`, `brave`, `edge`, `vivaldi`, `all`

3. Open `chrome://extensions` or `chromium://extensions`.
4. Enable Developer mode.
5. Click Load unpacked and choose `extension/`.
6. Pin the extension if you want one-click access.

## Notes

- The popup and page context menu only enable launching for `http` and `https` pages.
- Launching from the page context menu closes the current tab after the app window opens.
- In app-style windows, the page context menu flips to reopening the page in a normal browser tab instead.
- The extension uses a fixed public key in `extension/manifest.json`, so the unpacked extension ID stays stable for the native host.
- If you move this repository, rerun `./scripts/install-native-host.sh ...` so the native host manifest points at the new absolute path.
- Generated JavaScript under `extension/dist/` is ignored. Run `mise run check` to type-check and rebuild it.
