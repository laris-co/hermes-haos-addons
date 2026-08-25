#!/usr/bin/env sh
# Apply branding from /data/options.json, then hand PID 1 to the upstream image's
# own init exactly as if we were not here.
#
# Why an entrypoint wrapper rather than a build-time patch: the brand then comes
# from the add-on's Configuration tab, so changing a colour is Restart, not
# Rebuild, and upgrading ESPHome is a one-line version bump with no re-patching.
set -eu

python3 /brand.py || echo "brand: patch failed; continuing unbranded" >&2

# Hand off to whatever the upstream image actually starts with. s6-overlay's
# /init is the norm for Home-Assistant-derived images; the rest are fallbacks so
# a future base change degrades to "runs unbranded" instead of "won't boot".
for init in /init /usr/bin/dumb-init /docker-entrypoint.sh; do
    if [ -x "$init" ]; then
        exec "$init" "$@"
    fi
done

echo "brand: no known init found; starting the dashboard directly" >&2
exec python3 -m esphome dashboard /config/esphome
