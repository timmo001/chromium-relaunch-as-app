#!/usr/bin/env python3

import json
import os
import shutil
import struct
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse

HOST_NAME = "dev.omarchy.relaunch_as_app"
ALLOWED_SCHEMES = {"http", "https"}


def read_exact(size: int) -> bytes:
    data = sys.stdin.buffer.read(size)
    if len(data) != size:
        raise EOFError("Incomplete native messaging payload")
    return data


def read_message() -> dict:
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length:
        raise EOFError("No native message received")

    message_length = struct.unpack("=I", raw_length)[0]
    payload = read_exact(message_length)
    return json.loads(payload.decode("utf-8"))


def send_message(message: dict) -> None:
    payload = json.dumps(message).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("=I", len(payload)))
    sys.stdout.buffer.write(payload)
    sys.stdout.buffer.flush()


def resolve_launcher() -> str:
    candidates = [
        os.environ.get("OMARCHY_LAUNCH_WEBAPP"),
        shutil.which("omarchy-launch-webapp"),
        str(Path.home() / ".local/share/omarchy/bin/omarchy-launch-webapp"),
    ]

    for candidate in candidates:
        if candidate and os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            return candidate

    raise FileNotFoundError("Could not find omarchy-launch-webapp")


def validate_url(value: object) -> str:
    if not isinstance(value, str) or not value:
        raise ValueError("Request must include a non-empty url string")

    parsed = urlparse(value)
    if parsed.scheme not in ALLOWED_SCHEMES:
        raise ValueError("Only http and https URLs can be launched")

    if not parsed.netloc:
        raise ValueError("URL must include a host")

    return value


def launch_url(url: str) -> None:
    launcher = resolve_launcher()

    subprocess.Popen(
        [launcher, url],
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )


def main() -> int:
    try:
        request = read_message()
        url = validate_url(request.get("url"))
        launch_url(url)
        send_message({"ok": True})
        return 0
    except Exception as error:
        send_message({"ok": False, "error": str(error)})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
