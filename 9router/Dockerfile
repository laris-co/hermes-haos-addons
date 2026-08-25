# 9Router — HAOS add-on wrapper around decolua's published Docker image.
#
# READ THE SECURITY WARNING IN README.md BEFORE INSTALLING THIS.
# This is not boilerplate caution — see DOCS.md for the full advisory
# history: this codebase has shipped, and had to re-fix, multiple
# unauthenticated-RCE and auth-bypass vulnerabilities across 2026,
# several of them the SAME root cause (trusting a client-controlled
# Host/Origin/X-9r-Real-Ip header for a security decision) recurring
# after being "fixed" once already.
#
# Pinned by digest to the current latest tag (0.5.55 at time of
# packaging — verified newer than every patched-version floor found in
# the advisories below). Verified multi-arch via `docker manifest
# inspect` (amd64 + arm64).
FROM decolua/9router@sha256:f00fe389ef41a1999dd0d0275ad0c2955d13d176f7c4c5cb844b2f88c293c471

# Redirect the app's own data dir onto Supervisor's persistent per-add-on
# /data (the image's default, /app/data, is not what Supervisor backs
# up/persists — only the literal path /data is).
ENV DATA_DIR=/data

# nginx-light is the ingress sidecar (see rootfs/etc/nginx/9router-ingress.conf
# for the measurements that make it necessary). The base is Alpine 3.24, so apk,
# not apt-get — and --no-cache keeps the layer from carrying the index.
RUN apk add --no-cache nginx

COPY rootfs/etc/nginx/9router-ingress.conf /etc/nginx/9router-ingress.conf
# The static launcher page the ingress port serves (see run.sh / the conf above).
COPY rootfs/usr/share/9router-launcher/ /usr/share/9router-launcher/
COPY run.sh /addon/run.sh
RUN chmod 0755 /addon/run.sh

# ENTRYPOINT/CMD split, same pattern as every other add-on in this
# repo: run.sh does the options.json -> env translation then execs the
# upstream entrypoint.
ENTRYPOINT [ "/addon/run.sh" ]
CMD [ "node", "custom-server.js" ]
