# Uptime Kuma — HAOS add-on wrapper around louislam/uptime-kuma's
# published Docker image. Unmodified except for a persistent-data-dir
# redirect and this repo's standard extra_env translation shim.
#
# Pinned by digest, verified multi-arch (amd64/arm64/armv7, real
# manifest list via `docker manifest inspect`) — see DOCS.md.
FROM louislam/uptime-kuma@sha256:3e24e96c89efff0e3a4b0698cbdd36c15ad3022371db57166e5588853002ee5c

# Verified directly (grepped the image's own server/database.js):
# `Database.dataDir = process.env.DATA_DIR || args["data-dir"] || ... || "./data/"`
# — DATA_DIR is a real, working override, confirmed by actually running
# the image with it set and checking the logged "Data Dir:" line. This
# redirects Uptime Kuma's SQLite DB, uploaded assets, screenshots, and
# docker-tls certs onto Supervisor's backed-up, persistent /data.
ENV DATA_DIR=/data

COPY run.sh /addon/run.sh
RUN chmod 0755 /addon/run.sh

# Upstream's own ENTRYPOINT is `dumb-init --` (a real init, already
# handling PID-1 duties correctly — see config.yaml's init: false
# comment). run.sh re-execs into it explicitly at the end rather than
# this Dockerfile overriding ENTRYPOINT with something that bypasses
# it.
ENTRYPOINT [ "/addon/run.sh" ]
CMD [ "node", "server/server.js" ]
