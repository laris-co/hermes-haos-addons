# Device Builder (your brand) — a RESKIN of the ESPHome Device Builder, not a
# fork of its source. We start from the exact prebuilt image the official
# add-on ships and add one entrypoint wrapper that applies branding from
# /data/options.json at container start, then hands PID 1 to the upstream init.
#
# Nothing upstream is modified in this repository: the brand is generated at
# runtime from the user's own options, so ESPHome upgrades are a version bump
# here with no re-patching, and a colour change is a Restart, not a Rebuild.
#
# Licensing: the Device Builder frontend is Apache-2.0 and the dashboard
# backend MIT — both permit this. Apache-2.0 §6 withholds trademark rights,
# which is exactly why this add-on ships with a neutral default name and makes
# YOU supply the brand: do not pass off your build as ESPHome's. See DOCS.md.
#
# Pin the tag to the ESPHome version you want; bump deliberately and re-verify
# the injection still lands (brand.py fails soft and logs if the frontend moved).
FROM ghcr.io/esphome/esphome-hassio:2026.8.1

COPY rootfs/brand.py /brand.py
COPY rootfs/run.sh /run.sh
RUN chmod 0755 /run.sh /brand.py

ENTRYPOINT [ "/run.sh" ]
