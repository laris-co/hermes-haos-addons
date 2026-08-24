# Hermes Gateway — HAOS add-on, MINIMAL profile.
#
# v2: does NOT wrap nousresearch/hermes-agent's published Docker image
# anymore. That image bakes a full npm monorepo build (web + ui-tui),
# a Playwright Chromium install, and a Python venv with
# --extra all --extra messaging --extra otlp --extra anthropic --extra
# bedrock --extra azure-identity --extra hindsight --extra matrix — none
# of which `gateway run` needs, and none of which fit this add-on's
# target guest (2048 MB total, ~1 GB free after HA core + other add-ons).
#
# Confirmed from pyproject.toml (2026-08-24, commit pinned below):
#   - messaging/matrix/anthropic/bedrock/azure-identity/hindsight/otlp
#     were deliberately dropped from the `[all]` extra on 2026-05-12
#     specifically because they're lazy-installable via tools/lazy_deps.py
#     ("Anything an opt-in backend needs MUST live exclusively in
#     LAZY_DEPS and resolve at first use"). tools/lazy_deps.py:206-223
#     confirms platform.telegram / platform.discord / platform.slack are
#     all registered there.
#   - fastapi / uvicorn[standard] / python-multipart are UNCONDITIONAL
#     core dependencies (pyproject.toml `[project.dependencies]`), not
#     gated behind the `web` extra — so the optional API server here
#     needs no extra install either.
#   - No torch/vllm/transformers anywhere in runtime deps — this is a
#     hosted-API client (openai==2.24.0 + optional anthropic), not a
#     model-serving stack. No GPU, no model weights.
#
# So: plain `pip install` from a pinned source commit, no extras beyond
# what gateway/run.py actually imports at module load (discovered by
# building this image and watching for ImportError — see DOCS.md for
# the iteration log). No Node, no Playwright, no s6-overlay.
#
# TRADEOFF (documented in DOCS.md, not hidden): TERMINAL_ENV=local means
# the agent's code-exec tool runs commands directly in this container,
# not inside upstream's Docker-in-Docker sandbox (upstream's own docs
# default TERMINAL_CONTAINER_MEMORY=5120 MB for that sandbox — more RAM
# than this whole guest has free). HAOS add-ons don't get docker.sock by
# default anyway, so the sandboxed backend would be broken here
# regardless of memory. This is a real security downgrade, not a free
# lunch — see README.md/DOCS.md.

FROM python:3.13-slim-trixie AS src
# Pinned to the exact commit this add-on was built and read against
# (verified on origin/main, https://github.com/NousResearch/hermes-agent,
# 2026-08-02). Shallow-fetched by SHA so this stays reproducible even
# after upstream's main branch moves — a `git clone --branch main` would
# silently drift to whatever is newest at build time instead.
ARG HERMES_COMMIT=d1afa16053a3777849c2b5465d59a0147b2172f9
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && git init -q /src \
    && cd /src \
    && git remote add origin https://github.com/nousresearch/hermes-agent.git \
    && git fetch --depth 1 origin "${HERMES_COMMIT}" \
    && git checkout -q FETCH_HEAD \
    && rm -rf .git

FROM python:3.13-slim-trixie
LABEL org.opencontainers.image.source="https://github.com/nousresearch/hermes-agent"

# Runtime system deps only — no build toolchain kept in the final image.
# tini: this image has no bundled supervisor (no s6-overlay — that only
# existed to run upstream's own multi-service image); Supervisor's own
# `init: true` (see config.yaml) provides one instead, so nothing extra
# is installed here for that.
# git: hermes's skills sync / some skills shell out to git.
# ripgrep: several bundled skills (codebase-inspection etc.) shell out to
# `rg`; tiny (~2 MB), cheap to keep.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates git ripgrep openssh-client \
    && rm -rf /var/lib/apt/lists/*

COPY --from=src /src /src

# Minimal extra set for `gateway run` — see DOCS.md for the exact
# ImportError-driven iteration that arrived at this list. Deliberately
# NOT installed: messaging (telegram/discord/slack SDKs — lazy-installed
# by hermes itself on first real connect), matrix, anthropic, bedrock,
# azure-identity, hindsight, otlp, voice, wake, web-search/image/TTS
# backends. All of those still work if configured — hermes just installs
# them into /data/lazy-packages the first time they're actually used
# (this image does NOT set HERMES_DISABLE_LAZY_INSTALLS, unlike upstream's
# own Docker image, specifically so that still works).
# NOTE: upstream's setup.py deliberately refuses a normal wheel/sdist
# build ("Hermes is distributed via the shell installer, Docker image,
# or Nix... If you are developing, use an editable install instead:
# uv pip install -e ."). A plain `pip install /src` hits that guard and
# fails. An editable install is the sanctioned from-source path, which
# means /src has to stay in the final image (editable installs are a
# path pointer, not a copy) — this is why /src is placed under /opt
# instead of being deleted afterward like a normal build artifact.
RUN mv /src /opt/hermes-src \
    && pip install --no-cache-dir -e /opt/hermes-src \
    && rm -rf /root/.cache/pip

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV HERMES_HOME=/data
ENV HERMES_WRITE_SAFE_ROOT=/data
ENV HERMES_LAZY_INSTALL_TARGET=/data/lazy-packages
# No Docker-in-Docker sandbox available under Supervisor (no docker.sock
# by default) and no RAM budget for it even if there were one — see the
# top-of-file comment and DOCS.md. `local` runs tool commands directly
# in this container as whatever user the process runs as (root — see
# run.sh for why we don't bother with upstream's UID-remap dance here).
ENV TERMINAL_ENV=local

WORKDIR /data

COPY run.sh /addon/run.sh
RUN chmod 0755 /addon/run.sh

ENTRYPOINT [ "/addon/run.sh" ]
CMD [ "gateway", "run" ]
