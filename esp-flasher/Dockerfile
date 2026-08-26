# Digest-pinned: Supervisor 2026.04+ supplies no implicit BUILD_FROM.
FROM ghcr.io/home-assistant/base:3.22@sha256:0eda502b4d16e0433ace512d857ec3e86497d4214091ee459078ee4df6373f63

ARG BUILD_VERSION="dev"
ARG BUILD_ARCH="unknown"

LABEL \
    io.hass.version="${BUILD_VERSION}" \
    io.hass.type="app" \
    io.hass.arch="${BUILD_ARCH}"

# python3 is NOT in the base image and is what run.sh uses to read
# /data/options.json. Without it options are ignored SILENTLY.
RUN apk add --no-cache nginx python3 \
    && mkdir -p /run/nginx /usr/share/esp-flasher

COPY ingress.conf /etc/nginx/http.d/default.conf
COPY index.tmpl /usr/share/esp-flasher/index.tmpl
COPY check.js  /usr/share/esp-flasher/check.js
COPY run.sh /run.sh
RUN chmod 0755 /run.sh

CMD ["/run.sh"]
