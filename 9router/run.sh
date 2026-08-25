#!/bin/sh
# shellcheck shell=sh
#
# HAOS options.json -> env translation shim for 9router. Runs as PID 1
# (see Dockerfile ENTRYPOINT), as root — upstream's own /entrypoint.sh
# (which we exec into at the end) needs root to chown /app/data before
# dropping to the `node` user itself; see that script's contents in
# DOCS.md.
#
# This base image is Alpine with only Node.js installed (no python3),
# unlike the Debian-based hermes/litellm images in this repo — options.json
# parsing here uses `node -e` instead.
set -eu

OPTIONS_FILE="/data/options.json"

get_opt() {
    key="$1"
    if [ ! -f "$OPTIONS_FILE" ]; then
        echo ""
        return 0
    fi
    node -e '
const fs = require("fs");
try {
  const data = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const v = data[process.argv[2]];
  process.stdout.write(v === null || v === undefined ? "" : String(v));
} catch (e) { process.stdout.write(""); }
' "$OPTIONS_FILE" "$key"
}

get_extra_env() {
    if [ ! -f "$OPTIONS_FILE" ]; then
        return 0
    fi
    node -e '
const fs = require("fs");
try {
  const data = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  for (const item of data.extra_env || []) console.log(item);
} catch (e) { /* nothing */ }
' "$OPTIONS_FILE"
}

# --- Initial dashboard password: required, no fallback ---
# Verified directly against upstream's own README: unset INITIAL_PASSWORD
# defaults to the literal string "123456" for "first-login" (i.e. before
# any password hash is saved) — a well-known, publicly documented weak
# default. This is exactly the shape of the "default password" RCE this
# project has already shipped once (VulnCheck: "9router before 0.4.60
# Remote Code Execution via default password"). We do not let this add-on
# inherit that default: `options: null` + a non-optional schema type, the
# same pattern used throughout this repo, so Supervisor refuses to start
# the add-on until a real password is set.
initial_password="$(get_opt initial_password)"
if [ -z "$initial_password" ]; then
    echo "[9router] ERROR: initial_password must be set in this add-on's Configuration tab." >&2
    echo "[9router] Upstream's own default (INITIAL_PASSWORD unset) falls back to the literal password '123456' — the exact weakness behind a prior 9router RCE advisory. Set a real one." >&2
    exit 1
fi
export INITIAL_PASSWORD="$initial_password"

# --- Require an API key on /v1/* — default TRUE here, unlike upstream ---
# Verified directly: with REQUIRE_API_KEY unset, /v1/models is reachable
# with no credential at all in this image. Upstream's own security
# advisories (e.g. GHSA-x5c9-v98j-722r) explicitly recommend "Require an
# API key by default for /v1/* on public listeners" as the fix operators
# should apply themselves — upstream does not default to it. This add-on
# does: the schema default is `true`, and turning it off is a deliberate,
# visible opt-out rather than a silent inherited gap.
require_api_key="$(get_opt require_api_key)"
if [ "$require_api_key" = "false" ]; then
    export REQUIRE_API_KEY=false
    echo "[9router] WARNING: require_api_key is disabled. /v1/* endpoints will accept requests with no credential at all." >&2
else
    export REQUIRE_API_KEY=true
fi

# --- Cookie Secure flag ---
# Home Assistant's own frontend is normally HTTPS (directly or via a
# tunnel, e.g. Cloudflare) even though Supervisor's internal hop to this
# add-on's container is plain HTTP — the browser's Secure-cookie
# enforcement is based on the PAGE's origin scheme (what the browser
# itself is talking HTTPS to), not that internal hop, so this is safe to
# default true for the ingress-only deployment this add-on is built
# around. Expose it as an option only for the rare plain-HTTP-only LAN
# setup.
auth_cookie_secure="$(get_opt auth_cookie_secure)"
if [ "$auth_cookie_secure" = "false" ]; then
    export AUTH_COOKIE_SECURE=false
else
    export AUTH_COOKIE_SECURE=true
fi

# --- HMAC secrets: auto-generate + persist rather than inherit
# upstream's shared, source-visible static defaults ---
# Verified directly (upstream README): API_KEY_SECRET defaults to the
# literal string "endpoint-proxy-api-key-secret" and MACHINE_ID_SALT to
# "endpoint-proxy-salt" when unset — identical, publicly known values
# across every unconfigured install. We don't expose these as
# user-facing options (there's no reason an operator would want to pick
# their own HMAC secret by hand); instead we generate a strong random
# value on first boot and persist it, same pattern as the session-secret
# auto-generation used elsewhere in this repo.
seed_secret() {
    var_name="$1"
    file="/data/.$2"
    if [ ! -s "$file" ]; then
        node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))' > "$file"
        chmod 600 "$file"
    fi
    export "$var_name=$(cat "$file")"
}
seed_secret API_KEY_SECRET api-key-secret
seed_secret MACHINE_ID_SALT machine-id-salt

# --- Escape hatch: arbitrary KEY=VALUE pairs, same pattern as every
# other add-on in this repo.
extra_env="$(get_extra_env)"
if [ -n "$extra_env" ]; then
    old_ifs="$IFS"
    IFS='
'
    for pair in $extra_env; do
        case "$pair" in
            [A-Za-z_]*=*)
                # shellcheck disable=SC2163
                export "$pair"
                ;;
            *)
                echo "[9router] WARNING: ignoring malformed extra_env entry: $pair" >&2
                ;;
        esac
    done
    IFS="$old_ifs"
fi

# --- Ownership ---
# Upstream's own /entrypoint.sh does `chown -R node:node /app/data
# /app/data-home` before dropping privilege — hardcoded to /app/data,
# not DATA_DIR. Since we redirect DATA_DIR to /data (see Dockerfile),
# that chown would miss our actual persistent volume entirely, leaving
# it root-owned and unwritable by the `node` user entrypoint.sh drops
# to. Do it ourselves first.
chown -R node:node /data 2>/dev/null || echo "[9router] WARNING: chown /data failed — continuing" >&2

# --- HA ingress launcher ---
# nginx serves ONE static page on the ingress port (20129): a launcher that opens
# the real app on the published :20128 port. It does NOT proxy the SPA — that was
# tried and cannot work (see /etc/nginx/9router-ingress.conf for why). The app
# itself is reached directly on 20128; this only exists so the sidebar entry does
# something useful when clicked.
#
# Backgrounded rather than supervised: this add-on has no s6-overlay (config.yaml
# init: true), so if nginx dies nothing restarts it. Low risk for a static server.
if nginx -t -c /etc/nginx/9router-ingress.conf 2>/dev/null; then
    nginx -c /etc/nginx/9router-ingress.conf &
    echo "[9router] ingress launcher on 20129 → opens the app on :20128"
else
    # Fail loud rather than leaving a blank sidebar panel that looks like a bug.
    echo "[9router] ERROR: launcher nginx config failed to validate:" >&2
    nginx -t -c /etc/nginx/9router-ingress.conf >&2 2>&1 || true
    exit 1
fi

echo "[9router] exec: /entrypoint.sh $*"
exec /entrypoint.sh "$@"
