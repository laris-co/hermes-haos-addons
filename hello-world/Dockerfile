# Explicit and digest-pinned because Supervisor 2026.04+ no longer supplies an
# implicit BUILD_FROM. This OCI index contains linux/amd64 + linux/arm64.
FROM ghcr.io/home-assistant/base:3.22@sha256:0eda502b4d16e0433ace512d857ec3e86497d4214091ee459078ee4df6373f63

ARG BUILD_VERSION="dev"
ARG BUILD_ARCH="unknown"

LABEL \
    io.hass.version="${BUILD_VERSION}" \
    io.hass.type="app" \
    io.hass.arch="${BUILD_ARCH}"

RUN apk add --no-cache nginx \
    && mkdir -p /run/nginx /usr/share/hello-world

COPY ingress.conf /etc/nginx/http.d/default.conf
COPY index.html /usr/share/hello-world/index.html

CMD ["nginx", "-g", "daemon off;"]
