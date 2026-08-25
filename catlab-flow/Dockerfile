FROM ghcr.io/home-assistant/base:3.22@sha256:0eda502b4d16e0433ace512d857ec3e86497d4214091ee459078ee4df6373f63
ARG BUILD_VERSION="dev"
ARG BUILD_ARCH="unknown"
LABEL io.hass.version="${BUILD_VERSION}" io.hass.type="app" io.hass.arch="${BUILD_ARCH}"
RUN apk add --no-cache nginx
COPY ingress.conf /etc/nginx/http.d/default.conf
COPY build/index.html /usr/share/catlab-flow/index.html
COPY build/app.js /usr/share/catlab-flow/app.js
COPY build/app.css /usr/share/catlab-flow/app.css
CMD ["nginx", "-g", "daemon off;"]
