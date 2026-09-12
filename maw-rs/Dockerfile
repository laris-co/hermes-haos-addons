# maw — Home Assistant OS add-on: `maw serve` plus the maw web UI.
#
# maw serve is a real HTTP + WebSocket server ("APIs, federation, and browser
# views" in its own help text). It is NOT advertised in the README or in
# `maw --help`'s core command list — only `maw help --all` shows it. This
# add-on's first version was built on the wrong conclusion that maw had no
# web mode at all; it does.
#
# The UI it serves is maw-ui, published as a prebuilt dist tarball, so this
# image needs no node/bun toolchain. That dist is the same application
# deployed at god.buildwithoracle.com — verified by matching its built asset
# hash (boot-6wKmv1fM.css) and <title>ARRA Office</title> against that site.
FROM debian:13-slim

ARG TARGETARCH
ARG MAW_VERSION=v26.9.12-alpha.1834
ARG MAW_UI_VERSION=v1.4.2
# No .sha256 sidecar is published alongside the UI tarball, so this digest was
# measured from the release asset and pinned here by hand. It is what makes
# MAW_UI_VERSION an immutable reference rather than a mutable tag.
ARG MAW_UI_SHA256=d5ce5dc2fff06e8c991df5632bf8d11251309cd9f20fabf2044c2d3e71894693

# nginx: maw serve has no authentication of its own, so the catlab:catlab
# credential this add-on promises has to be enforced in front of it. Same
# reason (different mechanism) as this repo's thclaws add-on.
# tmux + git: maw is a tmux orchestrator and `maw work` clones repos; both are
# part of what the server drives, not optional extras.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl git nginx openssl tmux \
    && rm -rf /var/lib/apt/lists/*

# maw: only linux-x86_64 is published (verified against the release list — no
# aarch64 Linux asset), which is why config.yaml declares amd64 only.
#
# The published .sha256 sidecar is NOT plain `<hash>  <filename>` — it reads
# `<hash>  dist/<filename>`, a leftover build-tree path. `sha256sum -c` against
# it fails looking for a dist/ directory that does not exist here, so the hash
# field is compared directly instead.
RUN set -eu; \
    [ "$TARGETARCH" = "amd64" ] || { echo "maw: unsupported TARGETARCH: $TARGETARCH (only linux-x86_64 is published upstream)" >&2; exit 1; }; \
    BASE="https://github.com/Soul-Brews-Studio/maw-rs/releases/download/${MAW_VERSION}"; \
    NAME="maw-rs-linux-x86_64-musl"; \
    cd /tmp; \
    curl -fsSL -o "$NAME" "${BASE}/${NAME}"; \
    curl -fsSL -o "${NAME}.sha256" "${BASE}/${NAME}.sha256"; \
    want="$(awk '{print $1}' "${NAME}.sha256")"; \
    got="$(sha256sum "$NAME" | awk '{print $1}')"; \
    [ "$want" = "$got" ] || { echo "maw: checksum mismatch for $NAME" >&2; exit 1; }; \
    install -m 0755 "$NAME" /usr/local/bin/maw; \
    rm -f "$NAME" "${NAME}.sha256"

# The UI dist is baked into the image rather than downloaded at boot: an
# add-on must start without network access, and a boot-time fetch would make
# every restart depend on GitHub being up.
RUN set -eu; \
    cd /tmp; \
    curl -fsSL -o ui.tar.gz "https://github.com/Soul-Brews-Studio/maw-ui/releases/download/${MAW_UI_VERSION}/maw-ui-dist.tar.gz"; \
    echo "${MAW_UI_SHA256}  ui.tar.gz" | sha256sum -c -; \
    mkdir -p /opt/maw-ui; \
    tar xzf ui.tar.gz -C /opt/maw-ui; \
    rm -f ui.tar.gz; \
    test -f /opt/maw-ui/index.html

COPY rootfs/etc/nginx/ /etc/nginx/
COPY run.sh /run.sh
RUN chmod +x /run.sh

CMD ["/run.sh"]
