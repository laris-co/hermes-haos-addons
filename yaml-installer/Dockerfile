# Explicit and digest-pinned — Supervisor 2026.04+ passes only BUILD_VERSION and
# BUILD_ARCH; there is no implicit BUILD_FROM.
FROM ghcr.io/home-assistant/base:3.22@sha256:0eda502b4d16e0433ace512d857ec3e86497d4214091ee459078ee4df6373f63

ARG BUILD_VERSION="dev"
ARG BUILD_ARCH="unknown"

LABEL \
    io.hass.version="${BUILD_VERSION}" \
    io.hass.type="app" \
    io.hass.arch="${BUILD_ARCH}"

# python3 runs the server AND reads options — the base image does not include it,
# and without it the add-on would serve defaults silently. git does the pulling.
RUN apk add --no-cache python3 git \
    && mkdir -p /usr/share/yaml-installer

COPY server.py /usr/share/yaml-installer/server.py
COPY run.sh /run.sh
RUN chmod 0755 /run.sh

# Not ENTRYPOINT — the base image's /init (s6-overlay) keeps PID 1.
CMD ["/run.sh"]
