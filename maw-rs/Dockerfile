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

# nginx: fronts maw serve — supplies its bearer token, serves the UI at the
# root, and carries the WebSocket upgrade. See maw-ingress.conf.
# tmux + git: maw is a tmux orchestrator and `maw work` clones repos; both are
# part of what the server drives, not optional extras.
# python3: the add-on's session-creation endpoint, stdlib only — no pip, no
# framework. NOT python3-minimal, which other add-ons here use: that package
# is a stripped interpreter without http.server, and the script dies at import
# with "ModuleNotFoundError: No module named 'http'". Those add-ons only ever
# parse JSON, so they never hit it.
# openssl: generates maw serve's bearer token.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl git nginx openssl python3 tmux \
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

# maw-ui is built with Vite's default base of "/", which bakes an absolute
# asset root into the bundle's own preload helper:
#
#   const qe="modulepreload",Ge=function(n){return"/"+n}
#
# nginx rewrites the asset URLs in index.html, but this helper builds more of
# them at runtime — every lazily-loaded route's CSS. Under ingress those
# absolute URLs leave the /api/hassio_ingress/<token> prefix and 404 on Home
# Assistant, which the UI surfaces as "Something crashed — Unable to preload
# CSS for /assets/…". Dropping the leading slash makes them resolve against
# the document base, which is the ingress root.
#
# Patched here rather than with nginx sub_filter so it costs nothing per
# request, and the build FAILS if the pattern is not found — a maw-ui version
# bump that changes this shape must be looked at, not silently un-fixed.
RUN set -eu; \
    f=/opt/maw-ui/assets/main-*.js; \
    grep -q 'function(n){return"/"+n}' $f; \
    sed -i 's|function(n){return"/"+n}|function(n){return n}|g' $f; \
    ! grep -q 'function(n){return"/"+n}' $f

# Claude Code CLI. maw's whole job is driving agent CLIs in tmux panes, and
# this image had none — `maw wake` had nothing to launch.
#
# Anthropic's installer (https://claude.ai/install.sh) is not piped into a
# shell here. It resolves "latest" at run time, which would make every rebuild
# of this image produce a different add-on, and it installs into $HOME, which
# on this add-on is Supervisor's /data volume and would be shadowed at boot.
# Instead the same artefacts it uses are fetched directly, at a pinned
# version, and checked against the checksum from that version's own manifest.
#
# debian:13-slim is glibc, so linux-x64 rather than linux-x64-musl.
# This binary is ~210 MB and is most of this image's size.
ARG CLAUDE_CODE_VERSION=2.1.269
ARG CLAUDE_CODE_SHA256=25e44883f54419569a3d739f38cbbdaebe83b09895da0f343e1b003710a4775b
RUN set -eu; \
    [ "$TARGETARCH" = "amd64" ] || { echo "maw: unsupported TARGETARCH for claude: $TARGETARCH" >&2; exit 1; }; \
    url="https://downloads.claude.ai/claude-code-releases/${CLAUDE_CODE_VERSION}/linux-x64/claude"; \
    curl -fsSL -o /tmp/claude "$url"; \
    echo "${CLAUDE_CODE_SHA256}  /tmp/claude" | sha256sum -c -; \
    install -m 0755 /tmp/claude /usr/local/bin/claude; \
    rm -f /tmp/claude; \
    claude --version

# Codex CLI, the second agent runtime maw can drive. Single static binary
# from OpenAI's own release, pinned and checksummed. The release publishes a
# .sigstore bundle but no plain checksum file, so this digest was measured
# from the asset and pinned here, same as maw-ui's.
ARG CODEX_VERSION=rust-v0.154.0
ARG CODEX_SHA256=d7e18b2597ae8f242f5f31ee9e90deef48dbc9edd634d9868fb6435d08c07f02
RUN set -eu; \
    url="https://github.com/openai/codex/releases/download/${CODEX_VERSION}/codex-x86_64-unknown-linux-musl.tar.gz"; \
    curl -fsSL -o /tmp/codex.tgz "$url"; \
    echo "${CODEX_SHA256}  /tmp/codex.tgz" | sha256sum -c -; \
    tar xzf /tmp/codex.tgz -C /tmp; \
    install -m 0755 /tmp/codex-x86_64-unknown-linux-musl /usr/local/bin/codex; \
    rm -f /tmp/codex.tgz /tmp/codex-x86_64-unknown-linux-musl; \
    codex --version

# omx (oh-my-codex) is a Node CLI, not a binary — npm is the only distribution
# upstream publishes. Debian trixie's nodejs is 20.19, which satisfies the
# package's own "node >= 20" engine constraint, so no third-party Node repo is
# needed. Version pinned so a rebuild does not silently move.
ARG OMX_VERSION=0.21.5
RUN apt-get update && apt-get install -y --no-install-recommends nodejs npm \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g --no-fund --no-audit "oh-my-codex@${OMX_VERSION}" \
    && npm cache clean --force \
    && omx --version

COPY rootfs/etc/nginx/ /etc/nginx/
COPY rootfs/opt/maw-addon/ /opt/maw-addon/
COPY run.sh /run.sh
RUN chmod +x /run.sh

CMD ["/run.sh"]
