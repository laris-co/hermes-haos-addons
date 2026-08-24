# Hermes Agent (dashboard) — HAOS add-on, MINIMAL profile.
#
# v2: does NOT wrap nousresearch/hermes-agent's published Docker image
# anymore — see hermes-gateway/Dockerfile for the full rationale (same
# reasoning applies here: that image bakes Playwright + every optional
# provider extra, none of which `hermes dashboard` needs).
#
# Unlike the gateway, the dashboard genuinely needs a built frontend —
# confirmed the PyPI wheel does NOT bundle it (tool.setuptools.package-data
# only ships json schemas + gateway assets, no hermes_cli/web_dist). So
# this Dockerfile still runs a Node build stage, but ONLY for web/ and
# ui-tui/ — no Playwright install (that's for the agent's *browser tool*,
# a runtime dependency of the Python side, not of building the frontend),
# no matrix/bedrock/azure/hindsight/anthropic/otlp Python extras.
#
# TRADEOFF (documented in DOCS.md, not hidden): same TERMINAL_ENV=local
# downgrade as hermes-gateway — the dashboard's embedded Chat tab runs
# agent tool calls in-container, not in upstream's Docker-in-Docker
# sandbox.

ARG HERMES_COMMIT=d1afa16053a3777849c2b5465d59a0147b2172f9

FROM python:3.13-slim-trixie AS src
ARG HERMES_COMMIT
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && git init -q /src \
    && cd /src \
    && git remote add origin https://github.com/nousresearch/hermes-agent.git \
    && git fetch --depth 1 origin "${HERMES_COMMIT}" \
    && git checkout -q FETCH_HEAD \
    && rm -rf .git

# ---------------------------------------------------------------------
# Frontend builder — web/ (dashboard SPA) + ui-tui/ (prebuilt Chat-tab
# bundle) only. Discarded after; none of node_modules ships in the
# final image, just the two dist/ output directories.
# ---------------------------------------------------------------------
FROM node:26-bookworm-slim AS frontend
COPY --from=src /src /src
WORKDIR /src
# Prune workspace members this build doesn't need before `npm install`
# resolves the root package.json's `workspaces` array
# (apps/*, ui-tui, ui-tui/packages/*, web, tests-js). Without this,
# npm would also try to install apps/desktop (Electron — hundreds of MB,
# irrelevant to a headless add-on) and tests-js. apps/shared is kept:
# web/package.json references it as a `file:` workspace dependency.
RUN find apps -mindepth 1 -maxdepth 1 -not -name shared -exec rm -rf {} + \
    && rm -rf tests-js
RUN npm install --no-audit --prefer-offline
RUN cd web && npm run build && cd ../ui-tui && npm run build

# ---------------------------------------------------------------------
# Final image
# ---------------------------------------------------------------------
FROM python:3.13-slim-trixie
LABEL org.opencontainers.image.source="https://github.com/nousresearch/hermes-agent"

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates git ripgrep openssh-client \
    && rm -rf /var/lib/apt/lists/*

COPY --from=src /src /opt/hermes-src

# Same wheel-build guard as hermes-gateway — editable install is the
# sanctioned from-source path, so /opt/hermes-src stays in the image.
RUN pip install --no-cache-dir -e /opt/hermes-src \
    && rm -rf /root/.cache/pip

# Built frontend assets, copied in from the discarded Node stage. Paths
# are independent of /opt/hermes-src on purpose (env vars below point at
# them) so a future re-install of the Python package can't accidentally
# clobber them.
COPY --from=frontend /src/hermes_cli/web_dist /opt/hermes-web/web_dist
COPY --from=frontend /src/ui-tui/dist /opt/hermes-web/ui-tui/dist

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV HERMES_HOME=/data
ENV HERMES_WRITE_SAFE_ROOT=/data
ENV HERMES_LAZY_INSTALL_TARGET=/data/lazy-packages
ENV HERMES_WEB_DIST=/opt/hermes-web/web_dist
ENV HERMES_TUI_DIR=/opt/hermes-web/ui-tui
# See hermes-gateway/Dockerfile's comment — same sandbox tradeoff applies
# to the dashboard's embedded Chat tab.
ENV TERMINAL_ENV=local

WORKDIR /data

COPY run.sh /addon/run.sh
RUN chmod 0755 /addon/run.sh

ENTRYPOINT [ "/addon/run.sh" ]
CMD [ "dashboard", "--host", "0.0.0.0", "--port", "9119", "--no-open" ]
