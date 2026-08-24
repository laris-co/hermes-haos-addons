# LiteLLM Proxy — HAOS add-on wrapper around BerriAI's published Docker
# image. LiteLLM is an OpenAI-compatible proxy/router in front of 100+
# LLM providers — exposes a single /v1 endpoint that Hermes (or Open
# WebUI, or anything else that speaks the OpenAI API) can point at
# instead of juggling per-provider SDKs and keys.
#
# Pinned by digest (>= v1.83.14-stable, satisfies the >= 1.83.10
# requirement — images have been cosign-signed since v1.83.0). Verified
# by actually running this exact tag locally (2026-08-24):
#   - Ships with NO auth by default — /v1/models is reachable
#     unauthenticated unless LITELLM_MASTER_KEY is set. Confirmed
#     empirically: 401 without the env var, 200 with it once set.
#   - Config.yaml mounted at /app/config.yaml + --config flag: real
#     model list loads and is served correctly.
#   - No database required to run — DATABASE_URL is genuinely optional,
#     only needed for the virtual-key/spend-tracking persistence
#     features. This add-on does not bundle Postgres; DATABASE_URL is
#     exposed as an optional advanced setting for anyone who wants to
#     point it at their own instance (e.g. a separate Postgres add-on).
FROM ghcr.io/berriai/litellm@sha256:c81eb79cd4333c6cfe374c0ec929110fd23f0ee5f7fd198855a6fbddc77b83ba

COPY run.sh /addon/run.sh
RUN chmod 0755 /addon/run.sh

# ENTRYPOINT/CMD split, same pattern as the hermes add-ons in this repo:
# run.sh does the options.json -> env translation (and seeds config.yaml
# on first boot) then execs into the upstream entrypoint.
ENTRYPOINT [ "/addon/run.sh" ]
CMD [ "--config", "/data/config.yaml", "--port", "4000" ]
