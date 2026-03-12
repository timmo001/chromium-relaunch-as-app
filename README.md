# Chromium Relaunch As App

Small Manifest V3 extension that launches the current page in an app window by calling `omarchy-launch-webapp --app "URL"` through a native messaging host.

## Files

- `extension/` - unpacked Chrome/Chromium extension
- `native_host/` - Python native messaging host that spawns `omarchy-launch-webapp`
- `scripts/install-native-host.sh` - installs the native host manifest for a browser profile

## Install

1. Install the native host manifest for your browser:

   ```bash
   ./scripts/install-native-host.sh chromium
   ```

   Supported values: `chromium`, `chrome`, `brave`, `edge`, `vivaldi`, `all`

2. Open `chrome://extensions` or `chromium://extensions`.
3. Enable Developer mode.
4. Click Load unpacked and choose `extension/`.
5. Pin the extension if you want one-click access.

## Notes

- The popup and page context menu only enable launching for `http` and `https` pages.
- Launching from the page context menu closes the current tab after the app window opens.
- The extension uses a fixed public key in `extension/manifest.json`, so the unpacked extension ID stays stable for the native host.
- If you move this repository, rerun `./scripts/install-native-host.sh ...` so the native host manifest points at the new absolute path.
