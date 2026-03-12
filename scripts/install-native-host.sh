#!/usr/bin/env bash

set -euo pipefail

host_name="dev.omarchy.relaunch_as_app"
extension_id="gmbhiemgnkapbblhoipdeiemfacjjoch"

script_dir=$(dirname "$(readlink -f "$0")")
repo_root=$(dirname "$script_dir")
host_path="$repo_root/native_host/relaunch_current_page_host.py"
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
  target_dir="$1"
  mkdir -p "$target_dir"

  cat >"$target_dir/$host_name.json" <<EOF
{
  "name": "$host_name",
  "description": "Launch the current page in an app window via omarchy-launch-webapp.",
  "path": "$host_path",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$extension_id/"
  ]
}
EOF
}

if [[ ! -f "$host_path" ]]; then
  printf 'Native host script not found: %s\n' "$host_path" >&2
  exit 1
fi

chmod +x "$host_path"

if [[ "$browser" == "all" ]]; then
  for name in chromium chrome brave edge vivaldi; do
    write_manifest "$(native_host_dir "$name")"
    printf 'Installed native host manifest for %s\n' "$name"
  done
else
  target_dir=$(native_host_dir "$browser") || {
    printf 'Unsupported browser: %s\n' "$browser" >&2
    exit 1
  }

  write_manifest "$target_dir"
  printf 'Installed native host manifest for %s\n' "$browser"
fi

printf 'Load the unpacked extension from %s/extension\n' "$repo_root"
