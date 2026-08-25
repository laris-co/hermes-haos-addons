FROM ghcr.io/home-assistant/base:3.22@sha256:0eda502b4d16e0433ace512d857ec3e86497d4214091ee459078ee4df6373f63
ARG BUILD_VERSION="dev"
ARG BUILD_ARCH="unknown"
LABEL io.hass.version="${BUILD_VERSION}" io.hass.type="app" io.hass.arch="${BUILD_ARCH}"
RUN apk add --no-cache python3 \
    && mkdir -p /usr/share/mqtt-bridge-writer
COPY server.py /usr/share/mqtt-bridge-writer/server.py
COPY run.sh /run.sh
RUN chmod 0755 /run.sh
CMD ["/run.sh"]
