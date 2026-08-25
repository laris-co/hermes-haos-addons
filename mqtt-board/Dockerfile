# MQTT Board — Bun server + a no-build frontend.
#
# There is deliberately no bundler here. A sibling add-on in this repo learned
# the hard way that a committed dist/ silently goes stale against its source;
# this page is hand-written HTML/CSS/JS served as-is, so what you read is what
# runs. The only dependency is the mqtt client.
FROM oven/bun:1.3-alpine

WORKDIR /app

# Pinned major: mqtt 5 is the line the server is written against.
RUN bun add mqtt@5

COPY rootfs/server.ts /app/server.ts
COPY rootfs/web /app/web
COPY rootfs/run.sh /app/run.sh
RUN chmod 0755 /app/run.sh

ENTRYPOINT [ "/app/run.sh" ]
