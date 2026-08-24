#!/bin/sh
# shellcheck shell=sh
#
# HAOS options.json -> env translation shim for Uptime Kuma. Runs as
# PID 1 briefly, then execs into dumb-init (upstream's own real init —
# see config.yaml's init: false comment) so it keeps owning PID-1
# duties for the actual node process.
#
# Uptime Kuma has no credential options of its own to translate — it
# forces a real, interactive setup wizard on first visit (create the
# admin account there) and has no env-var-based auth bypass. So unlike
# every other add-on in this repo, there is nothing here to fail loud
# on: extra_env is the only option that exists.
set -eu

OPTIONS_FILE="/data/options.json"

get_opt_list() {
    key="$1"
    if [ ! -f "$OPTIONS_FILE" ]; then
        return 0
    fi
    python3 - "$OPTIONS_FILE" "$key" <<'PY'
import json, sys
path, key = sys.argv[1], sys.argv[2]
try:
    with open(path) as f:
        data = json.load(f)
except Exception:
    sys.exit(0)
for item in data.get(key, None) or []:
    print(item)
PY
}

extra_env="$(get_opt_list extra_env)"
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
                echo "[uptime-kuma] WARNING: ignoring malformed extra_env entry: $pair" >&2
                ;;
        esac
    done
    IFS="$old_ifs"
fi

echo "[uptime-kuma] exec: dumb-init -- $*"
exec dumb-init -- "$@"
