# Hermes Agent (dashboard) — Home Assistant OS add-on wrapper around Nous
# Research's published hermes-agent image, running `hermes dashboard`.
#
# See hermes-gateway/Dockerfile for the full rationale on pulling the
# published image instead of rebuilding from source. Same image, same
# pin, same reasoning — this add-on just launches a different CMD
# (`dashboard` instead of `gateway run`) and needs a different set of
# translated options (dashboard basic-auth credentials instead of
# messaging-platform tokens).
#
# Pinned by digest, verified multi-arch (amd64 + arm64, both native
# builds upstream) on 2026-08-24 — see hermes-gateway/Dockerfile for the
# `docker manifest inspect` verification note.
FROM nousresearch/hermes-agent@sha256:143bdb9086bb2db645346179f11091e621ef6b7f4f9e5049ae7454bfeb3a0495

# --- HA ingress sidecar ---
# nginx-light: a reverse proxy running IN this container, in front of
# hermes's own dashboard, so the add-on can use `ingress: true` (a
# sidebar panel, no published port) instead of a direct port + hermes's
# own basic-auth login page. Full rationale in
# rootfs/etc/nginx/hermes-ingress.conf and hermes-agent/DOCS.md — short
# version: binding hermes to loopback disables its own auth gate
# entirely (HA's session becomes the only auth boundary, same model as
# every other ingress add-on), which also sidesteps the login page's
# hardcoded root-relative paths that broke under ingress in the direct-
# port design this replaces.
RUN apt-get update && apt-get install -y --no-install-recommends nginx-light \
    && rm -rf /var/lib/apt/lists/*

# Upstream builds Vite with its default `base: "/"`.  The Python backend can
# rewrite the initial index.html for X-Forwarded-Prefix, but Vite's lazy-route
# preload helper remains root-relative and escapes HA ingress on CHAT/etc.
# Rebuild the already-pinned source with a relative base.  This fixes both the
# initial document and lazy routes by construction, and produces new content
# hashes so browsers cannot retain the broken upstream bundle from v1.1.1/2.
# The published image already contains the exact node_modules used upstream;
# this does not download or float any dependency.
RUN cd /opt/hermes/web \
    && ../node_modules/.bin/vite build --base ./

# Adds one new s6-rc service (nginx-ingress) alongside upstream's own
# "dashboard" and "main-hermes" services, registered in the same
# user/contents.d bundle — see rootfs/etc/s6-overlay/s6-rc.d/nginx-ingress/.
# A plain COPY here (not a rebuild) is exactly how upstream's own
# Dockerfile adds its s6 services; s6-overlay compiles the service
# database from this source tree at container boot, not at image build
# time, so adding files here is sufficient — no separate compile step.
COPY rootfs/ /

# Same reasoning as hermes-gateway: redirect hermes's state dir onto
# Supervisor's backed-up, persistent /data instead of the image's
# anonymous /opt/data VOLUME.
ENV HERMES_HOME=/data
ENV HERMES_WRITE_SAFE_ROOT=/data

COPY run.sh /addon/run.sh
RUN chmod 0755 /addon/run.sh

# Same ENTRYPOINT/CMD split as hermes-gateway — see that Dockerfile's
# comment. run.sh ends by exec-ing entrypoint-dispatch.sh so the upstream
# s6-overlay supervision tree still owns PID 1 (which now also
# supervises nginx-ingress, per the COPY above).
#
# --host 127.0.0.1, NOT 0.0.0.0: this is the load-bearing change from
# the direct-port design. See rootfs/etc/nginx/hermes-ingress.conf for
# why.
ENTRYPOINT [ "/addon/run.sh" ]
CMD [ "dashboard", "--host", "127.0.0.1", "--port", "9119", "--no-open" ]
