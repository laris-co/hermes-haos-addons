# Digest-pinned: Supervisor 2026.04+ supplies no implicit BUILD_FROM.
FROM ghcr.io/home-assistant/base:3.22@sha256:0eda502b4d16e0433ace512d857ec3e86497d4214091ee459078ee4df6373f63

ARG BUILD_VERSION="dev"
ARG BUILD_ARCH="unknown"

LABEL \
    io.hass.version="${BUILD_VERSION}" \
    io.hass.type="app" \
    io.hass.arch="${BUILD_ARCH}"

# nginx only — this add-on is a reverse proxy, it serves no local assets.
RUN apk add --no-cache nginx \
    && mkdir -p /run/nginx

COPY ingress.conf /etc/nginx/http.d/default.conf

CMD ["nginx", "-g", "daemon off;"]
