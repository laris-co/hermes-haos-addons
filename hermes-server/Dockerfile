# Hermes Server — HAOS add-on wrapper around Nous Research's published
# hermes-agent image, running `hermes serve`.
#
# `hermes serve` is the headless JSON-RPC/WebSocket backend Hermes
# Desktop (and any other remote client) connects to — per upstream's own
# docs: "the same server `hermes dashboard` runs, but headless: it never
# opens a browser UI." Confirmed directly: `hermes serve --host 0.0.0.0
# --port 9877` with no credentials produces the exact same
# "Refusing to bind... the auth gate engages on non-loopback binds"
# failure, referencing the same `dashboard.basic_auth` config namespace,
# as `hermes dashboard` does — it's the identical auth subsystem.
#
# Unlike hermes-agent (which now binds loopback + ingress, see that
# add-on's DOCS.md), this add-on genuinely needs a real, non-loopback,
# published port: Hermes Desktop and other remote clients connect to it
# directly over the network, not through a browser navigating Home
# Assistant's own frontend — ingress has no meaning for a raw JSON-RPC/
# WebSocket API with no browser page to embed. See hermes-gateway/
# Dockerfile for the full rationale on pulling the published image
# instead of rebuilding from source (same reasoning applies here).
#
# Pinned by digest, verified multi-arch (amd64 + arm64, both native
# builds upstream) — see hermes-gateway/Dockerfile for the
# `docker manifest inspect` verification note.
FROM nousresearch/hermes-agent@sha256:143bdb9086bb2db645346179f11091e621ef6b7f4f9e5049ae7454bfeb3a0495

ENV HERMES_HOME=/data
ENV HERMES_WRITE_SAFE_ROOT=/data

COPY run.sh /addon/run.sh
RUN chmod 0755 /addon/run.sh

# Same ENTRYPOINT/CMD split as hermes-gateway/hermes-agent — see those
# Dockerfiles' comments. run.sh ends by exec-ing entrypoint-dispatch.sh
# so the upstream s6-overlay supervision tree still owns PID 1.
ENTRYPOINT [ "/addon/run.sh" ]
CMD [ "serve", "--host", "0.0.0.0", "--port", "9119", "--no-open" ]
