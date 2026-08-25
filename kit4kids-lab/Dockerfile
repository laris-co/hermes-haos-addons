# Explicit and digest-pinned because Supervisor 2026.04+ no longer supplies an
# implicit BUILD_FROM. This OCI index contains linux/amd64 + linux/arm64.
FROM ghcr.io/home-assistant/base:3.22@sha256:0eda502b4d16e0433ace512d857ec3e86497d4214091ee459078ee4df6373f63

ARG BUILD_VERSION="dev"
ARG BUILD_ARCH="unknown"

LABEL \
    io.hass.version="${BUILD_VERSION}" \
    io.hass.type="app" \
    io.hass.arch="${BUILD_ARCH}"

# python3 is NOT in the base image and it is what run.sh uses to read
# /data/options.json — the reader every add-on in this repo uses instead of a jq
# dependency. Omit it and the options are ignored SILENTLY: the add-on starts,
# serves, and quietly shows defaults.
RUN apk add --no-cache nginx python3 \
    && mkdir -p /run/nginx /usr/share/kit4kids-lab

COPY ingress.conf /etc/nginx/http.d/default.conf
COPY index.tmpl /usr/share/kit4kids-lab/index.tmpl
COPY run.sh /run.sh
RUN chmod 0755 /run.sh

# Not ENTRYPOINT — the base image's /init (s6-overlay v3) keeps PID 1.
CMD ["/run.sh"]
