#!/bin/sh
# shellcheck shell=sh
#
# HAOS options.json -> rendered page shim.
#
# Two deliberate choices, both learned the hard way on this guest:
#
# 1. It renders index.tmpl -> index.html on EVERY start, rather than editing
#    index.html in place. A Supervisor restart reuses the container's writable
#    layer, so an in-place `sed -i` would find its placeholder already consumed
#    on the second restart and silently stop applying options. Rendering from an
#    untouched template is idempotent for free.
#
# 2. Substitution happens in python3, not sed, and every value is HTML-escaped.
#    A brand string containing a quote or an apostrophe is exactly the kind of
#    input that breaks a naive sed/JS injection elsewhere in this repo. Escaping
#    it here means "it's alive" is a legal greeting instead of a broken page.
#
# python3 is installed explicitly in the Dockerfile — it is NOT in the base
# image. If it were missing this would fail silently and serve the unrendered
# template, so the guard below fails LOUD instead.
set -eu

OPTIONS_FILE="/data/options.json"
TEMPLATE="/usr/share/hello-haos-oracle/index.tmpl"
OUTPUT="/usr/share/hello-haos-oracle/index.html"

if ! command -v python3 >/dev/null 2>&1; then
    echo "[hello-haos-oracle] FATAL: python3 missing — options cannot be read." >&2
    echo "[hello-haos-oracle] Refusing to serve an unbranded page as if it were configured." >&2
    exit 1
fi

python3 - "$OPTIONS_FILE" "$TEMPLATE" "$OUTPUT" <<'PY'
import html, json, sys

options_path, template_path, output_path = sys.argv[1], sys.argv[2], sys.argv[3]

DEFAULTS = {
    "greeting": "The workshop is open.",
    "accent_color": "#7c4dff",
}

try:
    with open(options_path) as f:
        options = json.load(f)
except Exception:
    # No options file is normal on a first start before anything is configured.
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

print(f"[hello-haos-oracle] rendered with greeting={values['greeting']!r} "
      f"accent={values['accent_color']!r}")
PY

exec nginx -g "daemon off;"
