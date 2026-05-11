#!/usr/bin/env bash

set -euo pipefail

relaunch_host_name="dev.omarchy.relaunch_as_app"
urls_host_name="dev.omarchy.browser_urls"
extension_id="gmbhiemgnkapbblhoipdeiemfacjjoch"

script_dir=$(dirname "$(readlink -f "$0")")
repo_root=$(dirname "$script_dir")
relaunch_host_path="$repo_root/native_host/relaunch_current_page_host.py"
urls_host_path="$repo_root/native_host/browser_urls_host.py"
browser="${1:-chromium}"

native_host_dir() {
  case "$1" in
    chromium) printf '%s\n' "$HOME/.config/chromium/NativeMessagingHosts" ;;
    chrome) printf '%s\n' "$HOME/.config/google-chrome/NativeMessagingHosts" ;;
    brave) printf '%s\n' "$HOME/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts" ;;
    edge) printf '%s\n' "$HOME/.config/microsoft-edge/NativeMessagingHosts" ;;
    vivaldi) printf '%s\n' "$HOME/.config/vivaldi/NativeMessagingHosts" ;;
    *) return 1 ;;
  esac
}

write_manifest() {
  local target_dir="$1"
  local host_name="$2"
  local host_path="$3"
  local description="$4"
  mkdir -p "$target_dir"

  cat >"$target_dir/$host_name.json" <<EOF
{
  "name": "$host_name",
  "description": "$description",
  "path": "$host_path",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$extension_id/"
  ]
}
EOF
}

install_for_browser() {
  local target_dir="$1"
  local browser_name="$2"

  write_manifest "$target_dir" "$relaunch_host_name" "$relaunch_host_path" \
    "Launch the current page in an app window via omarchy-launch-webapp."
  write_manifest "$target_dir" "$urls_host_name" "$urls_host_path" \
    "Track open tab URLs for external tools."

  printf 'Installed native host manifests for %s\n' "$browser_name"
}

for path in "$relaunch_host_path" "$urls_host_path"; do
  if [[ ! -f "$path" ]]; then
    printf 'Native host script not found: %s\n' "$path" >&2
    exit 1
  fi
  chmod +x "$path"
done

if [[ "$browser" == "all" ]]; then
  for name in chromium chrome brave edge vivaldi; do
    install_for_browser "$(native_host_dir "$name")" "$name"
  done
else
  target_dir=$(native_host_dir "$browser") || {
    printf 'Unsupported browser: %s\n' "$browser" >&2
    exit 1
  }

  install_for_browser "$target_dir" "$browser"
fi

printf 'Load the unpacked extension from %s/extension\n' "$repo_root"
