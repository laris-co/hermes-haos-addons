# Digest-pinned: Supervisor 2026.04+ supplies no implicit BUILD_FROM.
FROM ghcr.io/home-assistant/base:3.22@sha256:0eda502b4d16e0433ace512d857ec3e86497d4214091ee459078ee4df6373f63

ARG BUILD_VERSION="dev"
ARG BUILD_ARCH="unknown"

LABEL \
    io.hass.version="${BUILD_VERSION}" \
    io.hass.type="app" \
    io.hass.arch="${BUILD_ARCH}"

# nginx for serving; python3 only to render one small JSON file at boot from
# this add-on's own Supervisor-managed options (see render_creds.py) — never
# a build-time value, so no credential ever lands in an image layer.
RUN apk add --no-cache nginx python3 \
    && mkdir -p /run/nginx

COPY ingress.conf /etc/nginx/http.d/default.conf
RUN mkdir -p /usr/share/esp-flasher
COPY panel.js /usr/share/esp-flasher/panel.js
# The 128x32 OLED preview. Copied, not proxied: it is one 88 KB self-contained
# file with no absolute paths, so it costs nothing in the image and needs no
# sub_filter rewriting to survive the ingress mount.
COPY preview.html /usr/share/esp-flasher/preview.html
# The wall displays: twenty-plus designs plus the band photography they swap between.
# Copied, not proxied — they are ours, self-contained, and carry no absolute paths.
COPY wall/ /usr/share/esp-flasher/wall/
COPY render_creds.py /usr/share/esp-flasher/render_creds.py
COPY run.sh /run.sh
RUN chmod 0755 /run.sh

CMD ["/run.sh"]
