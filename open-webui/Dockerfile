# Open WebUI — HAOS add-on wrapper around the project's published Docker
# image. A browser chat UI speaking the OpenAI-compatible API — pairs
# naturally with the `litellm` add-on in this repo (point Open WebUI's
# openai_api_base_url option at litellm's /v1 endpoint).
#
# NOT using ingress — verified, not assumed. See README.md/DOCS.md: this
# is a compiled SvelteKit app whose static assets
# (/_next-equivalent /_app/immutable/... and /static/...) are
# root-relative with no runtime path-prefix awareness (tested
# PUBLIC_BASE_PATH directly; it did not change the emitted asset paths
# in this version). Under HA's path-prefixed ingress mount, those
# requests would resolve against the wrong root and 404. A real
# published port renders and functions correctly; ingress does not.
#
# Pinned by digest (v0.11.0). Verified multi-arch (amd64 + arm64) via
# `docker manifest inspect`.
FROM ghcr.io/open-webui/open-webui@sha256:72c0ba641ba75e7aa52655cb242570906ececd09b1140fb736483038a22b3228

# Redirect the app's own data dir onto Supervisor's persistent per-add-on
# /data (chat history, uploads, the vector DB, and the auto-generated
# WEBUI_SECRET_KEY file all live under DATA_DIR).
ENV DATA_DIR=/data

# No public signup, ever, for this add-on — the admin account is
# bootstrapped from options (see run.sh) via WEBUI_ADMIN_EMAIL/PASSWORD,
# which upstream's own start.sh already supports. Leaving signup on
# would let anyone who reaches the port before the operator does become
# a permanent account.
ENV ENABLE_SIGNUP=false

# Default to routing embeddings through an OpenAI-compatible endpoint
# instead of downloading and loading a local sentence-transformers model
# at boot — verified directly this avoids ~977 MB of disk (the model
# cache) and meaningfully lowers idle memory (~972 MiB -> ~690 MiB
# container in our testing). extra_env can override this if you
# specifically want the bundled local model.
ENV RAG_EMBEDDING_ENGINE=openai

COPY run.sh /addon/run.sh
RUN chmod 0755 /addon/run.sh

# ENTRYPOINT/CMD split, same pattern as every other add-on in this repo.
ENTRYPOINT [ "/addon/run.sh" ]
CMD [ "bash", "start.sh" ]
