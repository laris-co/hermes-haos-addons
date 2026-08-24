# LiteLLM Proxy — details

## What this wraps

`FROM ghcr.io/berriai/litellm@sha256:c81eb79cd4333c6cfe374c0ec929110fd23f0ee5f7fd198855a6fbddc77b83ba`
— the `v1.83.14-stable` tag, pulled and digest-pinned on 2026-08-24.
Satisfies the `>= 1.83.10` requirement; images have been cosign-signed
since v1.83.0 per upstream's own docs. Unmodified — this add-on only
adds a translation shim.

- `run.sh` — reads `/data/options.json`, exports `LITELLM_MASTER_KEY`
  (required) and `DATABASE_URL` (optional) plus `extra_env` pairs,
  seeds a starter `/data/config.yaml` on first boot if none exists, then
  `exec`s `/app/docker/prod_entrypoint.sh --config /data/config.yaml
  --port 4000`.
- Config lives on the persistent `/data` volume (`config.yaml`) so it
  survives add-on restarts/updates and is genuinely user-editable —
  there's no baked-in model list to fight.

## Why `master_key` is required with no default

Verified directly, not assumed: this image ships with **zero
authentication** unless `LITELLM_MASTER_KEY` is set.

```
$ docker run -d -p 14000:4000 ghcr.io/berriai/litellm:v1.83.14-stable
$ curl http://127.0.0.1:14000/v1/models
{"data":[],"object":"list"}          # no auth required at all

$ docker run -d -p 14001:4000 -e LITELLM_MASTER_KEY=sk-test ghcr.io/berriai/litellm:v1.83.14-stable
$ curl http://127.0.0.1:14001/v1/models
{"detail":"Authentication Error, No api key passed in. ..."}   # 401
$ curl -H "Authorization: Bearer sk-test" http://127.0.0.1:14001/v1/models
{"data":[],"object":"list"}          # 200
```

An empty-string `master_key` default would satisfy schema validation
and let the add-on start with the proxy wide open — anyone who can
reach the port could burn through whatever provider API keys are
configured in `config.yaml`, for free, on your dime. `options: null` +
a non-optional `password` schema type (the same pattern used throughout
this repo, e.g. `hermes-agent`'s original design) makes Supervisor
refuse Save/Start until a real key is entered, and `run.sh` checks
again before handing off, naming the Supervisor option specifically.

## Why the database is optional (and not bundled)

Verified: the proxy runs and serves requests fine with **no**
`DATABASE_URL` set at all — a `model_list`-only config (routing/
provider-mapping, no persistent virtual keys) needs nothing beyond the
container itself. `DATABASE_URL` is only needed for LiteLLM's
virtual-key issuance and spend-tracking persistence features. This
add-on deliberately does not bundle a Postgres instance — running two
services in one add-on container is a real complexity/maintenance cost,
and anyone who wants the DB-backed features on a HAOS host most likely
already has (or can install) a dedicated Postgres add-on to point this
at instead. `database_url` is exposed as an optional, schema-typed
`password?` field (connection strings routinely embed a password) for
that case.

## Config.yaml — user-editable, not add-on-managed

`run.sh` seeds a small starter file on first boot only (the `[ ! -f
"$CONFIG_FILE" ]` guard — never overwrites an edited config on
restart):

```yaml
model_list:
  - model_name: gpt-4o-mini
    litellm_params:
      model: openai/gpt-4o-mini
      api_key: os.environ/OPENAI_API_KEY
```

Verified this actually works end to end: with `extra_env:
["OPENAI_API_KEY=sk-fake"]` set and the seeded config unmodified, the
proxy loaded `gpt-4o-mini` into its served model list (visible via
`/v1/models` with the master key) — the `os.environ/VAR_NAME`
interpolation genuinely resolves from an env var this add-on set, not
just from a value pasted directly into the file.

## Verification log (2026-08-24)

Build host: arm64 Mac. Functional behavior tested is not arch-sensitive
the way image size is (see `hermes-gateway/DOCS.md` for that general
caveat) — these are all direct, non-emulated tests since the base image
itself was pulled and run natively for this arch during investigation
(no `--platform linux/amd64` override used for these specific checks;
see "Not verified" below for what that means for the amd64 claim).

### 1. Both archs confirmed published

```
$ docker manifest inspect ghcr.io/berriai/litellm:v1.83.14-stable
  "architecture": "amd64", "os": "linux"
  "architecture": "arm64", "os": "linux"
```

### 2. Fails loud with no master key

```
$ echo '{}' > options.json
$ docker run --name llm-noauth -v .../data:/data local/litellm:1.0.0
[litellm] ERROR: master_key must be set in this add-on's Configuration tab.
[litellm] LiteLLM ships with NO authentication by default — an unset master_key means anyone who can reach this add-on's port can use your configured provider keys for free.
$ docker inspect llm-noauth --format '{{.State.ExitCode}}'
1
```

### 3. Starts clean, seeds config, serves a real (fake-keyed) model

```
$ echo '{"master_key":"sk-my-master-key","extra_env":["OPENAI_API_KEY=sk-fake"]}' > options.json
$ docker run -d -p 14100:4000 -v .../data:/data local/litellm:1.0.0
$ ls .../data/config.yaml
(exists — seeded on first boot)
$ curl -o /dev/null -w '%{http_code}\n' http://127.0.0.1:14100/v1/models
401
$ curl -H "Authorization: Bearer sk-my-master-key" http://127.0.0.1:14100/v1/models
{"data":[{"id":"gpt-4o-mini","object":"model","created":1677610602,"owned_by":"openai"}],"object":"list"}
```

### 4. amd64 build, separately re-tested (not just assumed from arch-agnostic Python)

```
$ docker buildx build --platform linux/amd64 -t local/litellm-amd64:1.0.0 --load .
$ docker run -d --platform linux/amd64 -p 14200:4000 -v .../data:/data local/litellm-amd64:1.0.0
$ curl -o /dev/null -w '%{http_code}\n' http://127.0.0.1:14200/v1/models
401
$ curl -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer sk-my-master-key" http://127.0.0.1:14200/v1/models
200
```
Same result under QEMU emulation on this arm64 Mac as the native-arch
test above — the master-key gate and config loading both hold on amd64
too, not just assumed from LiteLLM being pure Python.

## Not verified

- No live HAOS Supervisor install — plain `docker build`/`docker run`
  only.
- No real provider API key was used (`OPENAI_API_KEY=sk-fake`) — only
  proved the key/config-loading mechanism, not an actual upstream LLM
  call.
- Virtual-key/spend-tracking features (the ones `DATABASE_URL` unlocks)
  were not tested at all — no Postgres was stood up for this pass.
- Image size / idle memory not measured.
