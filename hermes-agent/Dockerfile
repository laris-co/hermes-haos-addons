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

# Same reasoning as hermes-gateway: redirect hermes's state dir onto
# Supervisor's backed-up, persistent /data instead of the image's
# anonymous /opt/data VOLUME.
ENV HERMES_HOME=/data
ENV HERMES_WRITE_SAFE_ROOT=/data

COPY run.sh /addon/run.sh
RUN chmod 0755 /addon/run.sh

# Same ENTRYPOINT/CMD split as hermes-gateway — see that Dockerfile's
# comment. run.sh ends by exec-ing entrypoint-dispatch.sh so the upstream
# s6-overlay supervision tree still owns PID 1.
ENTRYPOINT [ "/addon/run.sh" ]
CMD [ "dashboard", "--host", "0.0.0.0", "--port", "9119", "--no-open" ]
