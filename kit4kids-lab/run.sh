#!/bin/sh
# shellcheck shell=sh
#
# HAOS options.json -> rendered bench card.
#
# Three deliberate choices, each one a scar:
#
# 1. Renders the template to index.html on EVERY start rather than editing the
#    served file. A Supervisor restart reuses the container's writable layer, so
#    an in-place `sed -i` would find its marker already consumed on the second
#    restart and silently stop applying options.
#
# 2. Substitution happens in python3 with HTML escaping, never sed. A classroom
#    name containing an apostrophe should be a legal name, not a broken page.
#
# 3. The placeholder tokens are named ONLY here and in the template's markup —
#    never inside a template comment. The renderer replaces every occurrence in
#    the file, comments included, which once turned an explanatory comment into
#    nonsense on the served page.
#
# python3 is installed explicitly in the Dockerfile because the base image lacks
# it. If it were missing this would fail silently and serve an unconfigured page,
# so the guard below fails LOUD instead.
set -eu

OPTIONS_FILE="/data/options.json"
TEMPLATE="/usr/share/kit4kids-lab/index.tmpl"
OUTPUT="/usr/share/kit4kids-lab/index.html"

if ! command -v python3 >/dev/null 2>&1; then
    echo "[kit4kids-lab] FATAL: python3 missing — options cannot be read." >&2
    echo "[kit4kids-lab] Refusing to serve an unconfigured page as if it were configured." >&2
    exit 1
fi

python3 - "$OPTIONS_FILE" "$TEMPLATE" "$OUTPUT" <<'PY'
import html, json, sys

options_path, template_path, output_path = sys.argv[1], sys.argv[2], sys.argv[3]

DEFAULTS = {
    "lab_name": "Kit4Kids",
    "accent_color": "#32c999",
    "mqtt_prefix": "DUSTBOY/DBK",
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

print("[kit4kids-lab] rendered lab={lab_name!r} accent={accent_color!r} "
      "mqtt={mqtt_prefix!r}".format(**values))
PY

exec nginx -g "daemon off;"
