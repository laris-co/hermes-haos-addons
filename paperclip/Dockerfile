# Paperclip — HAOS add-on wrapper around the OFFICIAL
# ghcr.io/paperclipai/paperclip image, with thClaws wired in as an
# agent-runtime adapter.
#
# EXPERIMENTAL — see README.md and DOCS.md before installing. This
# add-on may be withdrawn (same precedent as 9router) if it doesn't
# earn its place.
#
# PREBUILT ONLY, per explicit instruction: this does NOT build
# Paperclip from source and does NOT reproduce the ~4.66 GB local
# build that runs on black.local. It wraps the official, published,
# multi-arch ghcr.io/paperclipai/paperclip image at a pinned digest —
# our own layer adds only the checksummed thclaws binary and the
# adapter-registration files. The 5.62 GB base is upstream's; not ours
# to slim. It bundles FIVE full agent CLI toolchains (Claude Code,
# Codex, OpenCode, Gemini CLI, Kimi Code) plus Node 24 and a compiled
# monorepo — NONE of which the thclaws integration path uses. Most of
# this image's size is dead weight for this specific use case; see
# DOCS.md.

# ---------------------------------------------------------------------
# Stage 1: build the tiny thclaws-paperclip-adapter (vendored source —
# see adapter/NOTICE.md for why it's vendored instead of npm-installed,
# and adapter/src/paperclip-entry.ts for this repo's compatibility
# shim on top of the unmodified vendored logic).
# ---------------------------------------------------------------------
FROM node:24-trixie-slim AS adapter-build
WORKDIR /adapter
COPY adapter/package.json adapter/tsconfig.json ./
RUN npm install --no-audit --no-fund
COPY adapter/src ./src
RUN npx tsc \
    && test -f dist/paperclip-entry.js || (echo "ERROR: adapter build output missing" && exit 1)

# ---------------------------------------------------------------------
# Stage 2: fetch + checksum-verify the official thclaws release binary
# for this build's target arch — same mechanism, same pinned version
# (v0.115.0), as this repo's standalone thclaws/Dockerfile.
# ---------------------------------------------------------------------
FROM debian:13-slim AS thclaws-fetch
ARG TARGETARCH
ARG THCLAWS_VERSION=v0.115.0
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
RUN set -eu; \
    case "$TARGETARCH" in \
        amd64)  TRIPLE=x86_64-unknown-linux-gnu ;; \
        arm64)  TRIPLE=aarch64-unknown-linux-gnu ;; \
        *) echo "thclaws: unsupported TARGETARCH: $TARGETARCH" >&2; exit 1 ;; \
    esac; \
    BASE="https://github.com/thClaws/thClaws/releases/download/${THCLAWS_VERSION}"; \
    NAME="thclaws-${THCLAWS_VERSION}-${TRIPLE}.tar.gz"; \
    cd /tmp; \
    curl -fsSL -o "$NAME" "${BASE}/${NAME}"; \
    curl -fsSL -o "${NAME}.sha256" "${BASE}/${NAME}.sha256"; \
    sha256sum -c "${NAME}.sha256"; \
    tar -xzf "$NAME"; \
    install -m 0755 thclaws /usr/local/bin/thclaws

# ---------------------------------------------------------------------
# Stage 3: the actual add-on image.
# ---------------------------------------------------------------------
# Pinned by digest (resolved from :latest on 2026-08-24 — see DOCS.md
# for the `docker manifest inspect` verification: real amd64+arm64
# manifests, both published). No versioned tag was reachable with this
# session's registry read scope; the digest itself is the real pin,
# same guarantee this repo's other `FROM image@sha256:...` lines give.
FROM ghcr.io/paperclipai/paperclip@sha256:23090eb60885f130d460562c401e7b65789e42400c71708ecfcb6be5d6cfa936

# thclaws needs the same GUI-linked runtime libraries this repo's
# standalone thclaws add-on documents at length (readelf-verified hard
# NEEDED entries, not optional — see thclaws/DOCS.md for the full
# investigation). The base image is Debian trixie (node:24-trixie-slim
# per its own Dockerfile), so the same package names apply.
USER root
RUN apt-get update && apt-get install -y --no-install-recommends \
        libwayland-client0 libwebkit2gtk-4.1-0 libsoup-3.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=thclaws-fetch /usr/local/bin/thclaws /usr/local/bin/thclaws

# The adapter's actual code lives at a fixed image path, NOT under
# /data — Supervisor's persistent volume is a fresh bind-mount at
# container start (the same lesson thclaws/Dockerfile's comment
# documents for its own /data/workspace bug), so anything baked in at
# build time would be shadowed if it lived under /data instead.
# run.sh writes only the small JSON *registration record* pointing at
# this path into /data at every boot — the code itself never needs to
# be persisted or rewritten.
COPY --from=adapter-build /adapter/dist /opt/thclaws-adapter/dist
COPY --from=adapter-build /adapter/node_modules /opt/thclaws-adapter/node_modules
COPY adapter/package.json /opt/thclaws-adapter/package.json

# Redirect all of Paperclip's persistent state (embedded Postgres data,
# uploaded assets, local secrets key, instance config, agent workspace
# data) onto Supervisor's backed-up, persistent /data — same env var
# the official DOCKER.md's own one-liner example uses.
ENV PAPERCLIP_HOME=/data

COPY run.sh /addon/run.sh
RUN chmod 0755 /addon/run.sh

# run.sh does the /data setup (secrets, adapter registration, extra_env)
# as root, then hands off to upstream's own docker-entrypoint.sh, which
# does its own UID/GID remap and privilege drop (gosu) before exec-ing
# the real server process — unchanged from upstream's own ENTRYPOINT.
#
# CMD restated explicitly, verbatim from the base image's own
# Dockerfile — a real bug caught in testing: setting a new ENTRYPOINT
# in this stage silently reset CMD to null (Docker does not inherit a
# base image's CMD once the current build stage declares its own
# ENTRYPOINT), so run.sh's "$@" was empty and gosu received no command
# to run at all.
ENTRYPOINT [ "/addon/run.sh" ]
CMD [ "node", "--import", "./server/node_modules/tsx/dist/loader.mjs", "server/dist/index.js" ]
