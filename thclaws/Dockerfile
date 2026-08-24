# thCLAWS — Home Assistant OS add-on wrapper around thClaws
# (github.com/thClaws/thClaws)'s `--serve` web mode.
#
# NOT built from an upstream Docker image (thClaws doesn't publish
# one) and NOT compiled from source (explicitly out of scope — a Rust
# workspace build is unnecessary and heavy). Instead: download the
# official, checksummed GitHub Release binary for this platform and
# run it directly. See DOCS.md for the full investigation, including
# why this could NOT be the tiny single-binary image the brief for
# this add-on originally assumed.
#
# THE CORE FINDING (verified via `readelf -d` + real execution
# attempts on both amd64 and aarch64, not assumed from docs): there is
# only ONE official Linux binary per architecture, not two ("a GUI one
# and a CLI/serve one") as originally briefed. That one binary
# unconditionally links a full GTK3/WebKit2GTK/GStreamer/Wayland/D-Bus
# dependency stack — confirmed as hard ELF NEEDED entries, not
# optional dlopen()'d plugins — regardless of which mode you invoke it
# in. Upstream's own README says "(a) Use CLI mode — no GUI deps
# required"; this is directly contradicted by testing: even
# `thclaws --version` fails with
# "error while loading shared libraries: libdbus-1.so.3: cannot open
# shared object file" on a minimal Debian image with none of these
# libs installed. Installing upstream's own suggested packages
# (libwayland-client0, libwebkit2gtk-4.1-0, libsoup-3.0-0 — apt pulls
# in ~239 packages / ~642 MiB transitively, mostly GStreamer/GTK/Cairo)
# does fix it — `--serve` genuinely works afterward — but that is a
# real, substantial size cost this add-on does not hide.
FROM debian:13-slim

ARG TARGETARCH
# Pinned, not "latest" — same reasoning as every other add-on in this
# repo. Bump deliberately; re-verify the dependency list above still
# holds when you do (upstream could plausibly slim this down in a
# future release).
ARG THCLAWS_VERSION=v0.115.0

# python3-minimal for run.sh's options.json reader (same tool every
# other add-on in this repo uses instead of a jq dependency) — a real
# bug caught in testing: debian:13-slim, unlike this repo's other
# Dockerfiles (all FROM an upstream image that already ships Python),
# does not include python3 by default, and get_opt() failing silently
# would have meant a configured API key was never actually read.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl nginx-light python3-minimal \
        libwayland-client0 libwebkit2gtk-4.1-0 libsoup-3.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Fetch + checksum-verify the release tarball for this build's target
# arch, per upstream's own published .sha256 sidecar (real sha256sum
# format — "<hash>  <filename>" — verified directly, not guessed).
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
    install -m 0755 thclaws /usr/local/bin/thclaws; \
    rm -f "$NAME" "${NAME}.sha256" thclaws

COPY rootfs/etc/nginx/thclaws-ingress.conf /etc/nginx/thclaws-ingress.conf

# Redirect all of thclaws's persistent state (~/.thclaws,
# ~/.config/thclaws, the gui-shell-tokens file, etc.) plus its one
# working "project" directory onto Supervisor's backed-up, persistent
# /data — see run.sh and DOCS.md ("one project per process" — what
# that means for this add-on's default workspace). The actual
# directories are created by run.sh at container start, NOT here: a
# real bug caught in testing — /data is Supervisor's persistent volume,
# bind-mounted fresh over whatever this layer put there, so `mkdir -p
# /data/...` at build time is a no-op for any real install.
ENV HOME=/data/home

COPY run.sh /addon/run.sh
RUN chmod 0755 /addon/run.sh

ENTRYPOINT [ "/addon/run.sh" ]
