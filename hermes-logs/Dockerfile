# Explicit and digest-pinned because Supervisor 2026.04+ no longer supplies an
# implicit BUILD_FROM. This OCI index contains linux/amd64 + linux/arm64.
FROM ghcr.io/home-assistant/base:3.22@sha256:0eda502b4d16e0433ace512d857ec3e86497d4214091ee459078ee4df6373f63

ARG BUILD_VERSION="dev"
ARG BUILD_ARCH="unknown"

LABEL \
    io.hass.version="${BUILD_VERSION}" \
    io.hass.type="app" \
    io.hass.arch="${BUILD_ARCH}"

RUN apk add --no-cache python3 \
    && addgroup -S hermeslogs \
    && adduser -S -D -H -G hermeslogs hermeslogs \
    && mkdir -p /opt/hermes-logs \
    && chown -R hermeslogs:hermeslogs /opt/hermes-logs

COPY --chown=hermeslogs:hermeslogs server.py index.html styles.css app.js /opt/hermes-logs/

USER hermeslogs
WORKDIR /opt/hermes-logs
EXPOSE 8099

CMD ["python3", "server.py"]
