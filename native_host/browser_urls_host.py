#!/usr/bin/env python3
"""Native messaging host for browser URL tracking.

Receives tab URL state from the Relaunch As App Chrome extension via a
persistent native messaging connection and writes it to a JSON file for
external tools (e.g. workspace-capture) to read.
"""

import json
import os
import struct
import sys
import tempfile

STATE_FILE = os.path.join(
    os.environ.get("XDG_STATE_HOME", os.path.expanduser("~/.local/state")),
    "browser-urls.json",
)


def read_message():
    raw = sys.stdin.buffer.read(4)
    if len(raw) < 4:
        return None
    length = struct.unpack("<I", raw)[0]
    if length == 0:
        return None
    data = sys.stdin.buffer.read(length)
    if len(data) < length:
        return None
    return json.loads(data)


def main():
    os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)

    while True:
        msg = read_message()
        if msg is None:
            break

        # Atomic write via temp file + rename
        dirn = os.path.dirname(STATE_FILE)
        fd, tmp = tempfile.mkstemp(dir=dirn, suffix=".tmp")
        try:
            with os.fdopen(fd, "w") as f:
                json.dump(msg, f, indent=2)
            os.replace(tmp, STATE_FILE)
        except Exception:
            try:
                os.unlink(tmp)
            except OSError:
                pass


if __name__ == "__main__":
    main()
