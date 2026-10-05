# Hermes Gateway — Home Assistant OS add-on wrapper around Nous Research's
# published hermes-agent image.
#
# We deliberately do NOT rebuild hermes from source. Upstream's own
# Dockerfile (nousresearch/hermes-agent/Dockerfile) compiles a patched
# SQLite, downloads s6-overlay + Node 26, npm-installs two frontends,
# installs a Playwright Chromium, and does a multi-extra `uv sync` —
# their own comments put a cold build at 15-45 minutes. Re-doing that
# inside Supervisor's add-on builder would make every install of this
# add-on repeat that whole build for no benefit, since upstream already
# publishes a real multi-arch image. We pull that image and layer on
# only what a HAOS add-on actually needs: an options.json -> env
# translation shim, and redirecting hermes's state dir to Supervisor's
# per-addon /data volume.
#
# Pinned by digest, not a mutable tag, for reproducible builds. Pinned to
# the v2026.9.24 release image, verified with `docker manifest inspect
# nousresearch/hermes-agent:v2026.9.24` on 2026-10-05 (digest cross-checked
# against Docker Hub's tag metadata): a multi-arch manifest list covering
# linux/amd64 AND linux/arm64, both built on real native runners per
# hermes-agent's .github/workflows/docker.yml matrix (arm64 runs on
# ubuntu-24.04-arm, not qemu emulation) — so claiming aarch64 support
# here is honest, not aspirational.
#
# The previous pin was the image built from revision 057dcdf2 (2026-08-24),
# which predates upstream's markerless-config migration fix
# (NousResearch/hermes-agent a88bef98b2, 2026-09-24) — so a fresh /data
# volume could still hit that script's false "config predates version 12"
# refusal. v2026.9.24 is built from a revision after that fix.
FROM nousresearch/hermes-agent@sha256:fca358f12efd65bfaaca05884166f15c0e2788375ca30d77061ac1ebc96452b7

# Supervisor gives every add-on a persistent, backed-up /data directory
# for free (no `map:` entry needed). Point hermes's own state directory
# there instead of the image's built-in /opt/data (an anonymous VOLUME
# Supervisor knows nothing about) so config.yaml, auth.json, sessions,
# memories, skills, and cron jobs actually survive add-on restarts,
# updates, and HA backups.
ENV HERMES_HOME=/data
ENV HERMES_WRITE_SAFE_ROOT=/data

COPY run.sh /addon/run.sh
RUN chmod 0755 /addon/run.sh

# Do NOT replace the upstream ENTRYPOINT wholesale — entrypoint-dispatch.sh
# -> s6-overlay's /init is the whole point of setting init: false in
# config.yaml (the image already supervises itself; see upstream
# docker/entrypoint-dispatch.sh for the PID-1 / non-PID-1 handling this
# add-on relies on unmodified). Our entrypoint is a thin translation shim
# that runs first, as PID 1, and ends by `exec`-ing straight into
# entrypoint-dispatch.sh — so the upstream supervision tree still owns
# PID 1 exactly as it would under plain `docker run`.
ENTRYPOINT [ "/addon/run.sh" ]
CMD [ "gateway", "run" ]
