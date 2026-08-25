#!/bin/sh
set -eu
command -v python3 >/dev/null 2>&1 || { echo "[mqtt-bridge-writer] FATAL: no python3" >&2; exit 1; }
exec python3 /usr/share/mqtt-bridge-writer/server.py
