#!/bin/sh
# shellcheck shell=sh
# Renders index.tmpl -> index.html on EVERY start.
#
# Not an in-place edit: a Supervisor restart reuses the container's writable
# layer, so `sed -i` would find its placeholder already consumed on the second
# start and silently stop applying options. Rendering from an untouched template
# is idempotent for free.
set -eu

OPTIONS_FILE="/data/options.json"
TEMPLATE="/usr/share/esp-flasher/index.tmpl"
OUTPUT="/usr/share/esp-flasher/index.html"

if ! command -v python3 >/dev/null 2>&1; then
    echo "[esp-flasher] FATAL: python3 missing — options cannot be read." >&2
    exit 1
fi

python3 - "$OPTIONS_FILE" "$TEMPLATE" "$OUTPUT" <<'PY'
import html, json, sys
options_path, template_path, output_path = sys.argv[1], sys.argv[2], sys.argv[3]

DEFAULTS = {
    "gallery_url": "https://the-oracle-keeps-the-human-human.github.io/workshop-04-esp32-wasm/",
    # Empty manifest = "connect to an already-flashed board and configure Wi-Fi",
    # which is the common case here. esp-web-tools still offers Improv without a
    # firmware manifest to install.
    "manifest_url": "",
}

try:
    with open(options_path) as f:
        options = json.load(f)
except Exception:
    options = {}

values = {}
for key, fallback in DEFAULTS.items():
    raw = options.get(key)
    value = raw if isinstance(raw, str) and raw.strip() else fallback
    values[key] = html.escape(value, quote=True)

with open(template_path) as f:
    page = f.read()
for key, value in values.items():
    page = page.replace("{{" + key.upper() + "}}", value)
with open(output_path, "w") as f:
    f.write(page)
print(f"[esp-flasher] rendered gallery={values['gallery_url']!r}")
PY

exec nginx -g "daemon off;"
