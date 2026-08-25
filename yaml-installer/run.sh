#!/bin/sh
# shellcheck shell=sh
set -eu

if ! command -v python3 >/dev/null 2>&1; then
    echo "[yaml-installer] FATAL: python3 missing." >&2
    exit 1
fi
if ! command -v git >/dev/null 2>&1; then
    echo "[yaml-installer] FATAL: git missing." >&2
    exit 1
fi

# The server binds 8099 and answers only the Supervisor's ingress requests —
# python itself enforces the peer check (see server.py), since there is no nginx
# in front of it here.
exec python3 /usr/share/yaml-installer/server.py
