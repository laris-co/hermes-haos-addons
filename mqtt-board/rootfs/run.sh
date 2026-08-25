#!/usr/bin/env sh
# Translate /data/options.json into the env the server reads, then exec it.
#
# Options are read in ONE bun call that prints `export` lines (rather than one
# call per key): fewer processes, and the multi-line topics list survives
# intact, which a naive per-key read mangles.
set -eu

eval "$(bun -e '
const o = (() => { try { return require("/data/options.json"); } catch { return {}; } })();
const q = (v) => "'"'"'" + String(v ?? "").split("'"'"'").join(`'"'"'\\'"'"''"'"'`) + "'"'"'";
const topics = Array.isArray(o.topics) ? o.topics : (o.topics ? [o.topics] : []);
console.log(`export MB_BROKER=${q(o.broker)}`);
console.log(`export MB_USER=${q(o.username)}`);
console.log(`export MB_PASS=${q(o.password)}`);
console.log(`export MB_TOPICS=${q(topics.join("\n"))}`);
console.log(`export MB_MAX_TOPICS=${q(o.max_topics ?? 500)}`);
')"

if [ -z "${MB_BROKER:-}" ]; then
    echo "mqtt-board: no broker set — open Configuration and set one." >&2
    exit 1
fi

# Log where we are pointing, but never the password.
echo "mqtt-board: broker=${MB_BROKER} user=${MB_USER:-<anonymous>}"

exec bun /app/server.ts
