#!/bin/sh
set -eu
command -v python3 >/dev/null 2>&1 || { echo "[esp-flasher] FATAL: no python3" >&2; exit 1; }
python3 /usr/share/esp-flasher/render_creds.py
exec nginx -g "daemon off;"
