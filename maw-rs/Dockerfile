# maw — Home Assistant OS add-on: a web terminal in front of the maw CLI.
#
# Same shape as this repo's thclaws add-on: neither upstream binary has a
# Docker image of its own, so both are fetched as official, checksummed
# GitHub Release assets and run directly — no source build.
#
# ttyd as a static binary rather than `apt install ttyd`: Debian's package
# tracker lists ttyd only in "sid", not confirmed present in trixie's apt
# archive, and this repo's own convention (thclaws' Dockerfile) is already
# "download the release binary, verify its checksum" over depending on
# whatever a given base image's apt repo happens to carry.
FROM debian:13-slim

ARG TARGETARCH
ARG MAW_VERSION=v26.7.16-alpha.1159
ARG TTYD_VERSION=1.7.7

# python3-minimal for run.sh's options.json reader — same tool this repo's
# other add-ons (thclaws, hermes-agent) use instead of adding a jq
# dependency. tmux is maw's own substrate: it manages tmux sessions/windows
# for each "oracle", so this is not optional the way it would be for a
# plain CLI tool.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl python3-minimal tmux \
    && rm -rf /var/lib/apt/lists/*

# maw: only linux-x86_64-musl is published (verified via `gh release view
# --repo Soul-Brews-Studio/maw-rs` — no aarch64 Linux asset exists), which
# is also why this add-on's config.yaml declares amd64 only.
#
# The published .sha256 sidecar is NOT plain `<hash>  <filename>` — it is
# `<hash>  dist/<filename>` (a leftover build-tree path from upstream's own
# release process). Verified directly: `sha256sum -c` against that file
# fails with "dist/maw-rs-linux-x86_64-musl: No such file or directory"
# unless you either recreate that path or (simpler, done here) compare the
# hash field yourself rather than trusting the sidecar's filename column.
RUN set -eu; \
    case "$TARGETARCH" in \
        amd64) TRIPLE=x86_64 ;; \
        *) echo "maw: unsupported TARGETARCH: $TARGETARCH (only linux-x86_64-musl is published upstream)" >&2; exit 1 ;; \
    esac; \
    BASE="https://github.com/Soul-Brews-Studio/maw-rs/releases/download/${MAW_VERSION}"; \
    NAME="maw-rs-linux-${TRIPLE}-musl"; \
    cd /tmp; \
    curl -fsSL -o "$NAME" "${BASE}/${NAME}"; \
    curl -fsSL -o "${NAME}.sha256" "${BASE}/${NAME}.sha256"; \
    want="$(awk '{print $1}' "${NAME}.sha256")"; \
    got="$(sha256sum "$NAME" | awk '{print $1}')"; \
    [ "$want" = "$got" ] || { echo "maw: checksum mismatch for $NAME" >&2; exit 1; }; \
    install -m 0755 "$NAME" /usr/local/bin/maw; \
    rm -f "$NAME" "${NAME}.sha256"

# ttyd: static binary, checksum verified against upstream's own
# SHA256SUMS file (one file covering every architecture's binary).
RUN set -eu; \
    case "$TARGETARCH" in \
        amd64) TTYD_ARCH=x86_64 ;; \
        arm64) TTYD_ARCH=aarch64 ;; \
        *) echo "maw: unsupported TARGETARCH for ttyd: $TARGETARCH" >&2; exit 1 ;; \
    esac; \
    BASE="https://github.com/tsl0922/ttyd/releases/download/${TTYD_VERSION}"; \
    cd /tmp; \
    curl -fsSL -o "ttyd.${TTYD_ARCH}" "${BASE}/ttyd.${TTYD_ARCH}"; \
    curl -fsSL -o SHA256SUMS "${BASE}/SHA256SUMS"; \
    grep "ttyd.${TTYD_ARCH}\$" SHA256SUMS | sha256sum -c -; \
    install -m 0755 "ttyd.${TTYD_ARCH}" /usr/local/bin/ttyd; \
    rm -f "ttyd.${TTYD_ARCH}" SHA256SUMS

# No nginx sidecar, unlike thclaws — thclaws needs one because the
# thclaws binary itself only supports --bind 127.0.0.1 (upstream's own
# --serve has no way to listen on an arbitrary ingress_port directly).
# ttyd has no such restriction: run.sh invokes it with -p pointed straight
# at ingress_port, so Supervisor's ingress proxy talks to it with nothing
# in between.
COPY run.sh /run.sh
RUN chmod +x /run.sh

CMD ["/run.sh"]
