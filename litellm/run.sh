#!/bin/sh
# shellcheck shell=sh
#
# HAOS options.json -> env translation shim for the LiteLLM proxy. Runs
# as PID 1 (see Dockerfile ENTRYPOINT). Same python3-based options.json
# reader as the hermes add-ons in this repo (no jq dependency).
set -eu

OPTIONS_FILE="/data/options.json"
CONFIG_FILE="/data/config.yaml"

get_opt() {
    key="$1"
    if [ ! -f "$OPTIONS_FILE" ]; then
        echo ""
        return 0
    fi
    python3 - "$OPTIONS_FILE" "$key" <<'PY'
import json, sys
path, key = sys.argv[1], sys.argv[2]
try:
    with open(path) as f:
        data = json.load(f)
except Exception:
    print("")
    sys.exit(0)
val = data.get(key, "")
if val is None:
    val = ""
print(val)
PY
}

# --- Master key: required, no default ---
# Verified directly: this image ships with NO auth at all unless
# LITELLM_MASTER_KEY is set — /v1/models (and every proxied completion
# call) is reachable by anyone who can reach the port otherwise. An
# empty-string default here would satisfy schema validation and ship an
# add-on that LOOKS secured (there's a "master key" field!) but isn't —
# exactly the failure class this repo has tried to avoid throughout.
# `options: null` + a non-optional schema type makes Supervisor refuse
# to start the add-on until a real key is set.
master_key="$(get_opt master_key)"
if [ -z "$master_key" ]; then
    echo "[litellm] ERROR: master_key must be set in this add-on's Configuration tab." >&2
    echo "[litellm] LiteLLM ships with NO authentication by default — an unset master_key means anyone who can reach this add-on's port can use your configured provider keys for free." >&2
    exit 1
fi
export LITELLM_MASTER_KEY="$master_key"

# --- Optional: external Postgres for virtual keys / spend tracking ---
# Genuinely optional — verified the proxy runs fine with no database at
# all (a smaller model_list/OpenAI-passthrough setup doesn't need it).
# This add-on does not bundle Postgres; point this at your own instance
# (e.g. a separate Postgres add-on) if you want virtual-key management.
database_url="$(get_opt database_url)"
if [ -n "$database_url" ]; then
    export DATABASE_URL="$database_url"
fi

# --- Escape hatch for provider API keys and any other env-based tuning.
# LiteLLM's own config.yaml supports `os.environ/VAR_NAME` interpolation
# (e.g. `api_key: os.environ/OPENAI_API_KEY`), so this is the intended
# way to supply provider credentials without baking them into the image
# or writing them in plaintext inside config.yaml.
if [ -f "$OPTIONS_FILE" ]; then
    extra_env="$(python3 - "$OPTIONS_FILE" <<'PY'
import json, sys
try:
    with open(sys.argv[1]) as f:
        data = json.load(f)
except Exception:
    sys.exit(0)
for item in data.get("extra_env", None) or []:
    print(item)
PY
)"
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
                    echo "[litellm] WARNING: ignoring malformed extra_env entry: $pair" >&2
                    ;;
            esac
        done
        IFS="$old_ifs"
    fi
fi

# --- Seed a starter config.yaml on first boot only ---
# /data is Supervisor's persistent per-add-on volume — this is the
# "user-editable config" surface: edit config.yaml on the host (Samba/
# SSH/File editor add-on) or via `docker exec`, then restart the add-on.
if [ ! -f "$CONFIG_FILE" ]; then
    cat > "$CONFIG_FILE" <<'YAML'
# LiteLLM proxy config — edit this file, then restart the add-on.
# Full reference: https://docs.litellm.ai/docs/proxy/configs
#
# Reference provider API keys via os.environ/VAR_NAME and supply the
# actual value through this add-on's `extra_env` option
# (e.g. "OPENAI_API_KEY=sk-..."), not hardcoded here in plaintext.
model_list:
  - model_name: gpt-4o-mini
    litellm_params:
      model: openai/gpt-4o-mini
      api_key: os.environ/OPENAI_API_KEY

# general_settings:
#   master_key: os.environ/LITELLM_MASTER_KEY   # already set by this add-on
YAML
    echo "[litellm] Seeded a starter $CONFIG_FILE — edit it and restart the add-on to apply changes."
fi

echo "[litellm] exec: /app/docker/prod_entrypoint.sh $*"
exec /app/docker/prod_entrypoint.sh "$@"
