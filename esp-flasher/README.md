# ESP32 Workshop

Serves the **real** *Many Bodies, One Soul* gallery and web flasher inside the
Home Assistant sidebar:

- https://the-oracle-keeps-the-human-human.github.io/workshop-04-esp32-wasm/

It is a reverse proxy, not a copy. `docs/` upstream is ~89 MB (47 firmware
binaries), and a copy would go stale silently.

## The one thing that will confuse you

**Web Serial only works in a secure context.** Home Assistant reached over
`http://<host>.local` is not one, so Connect does nothing there. Open Home
Assistant over **HTTPS** and it works.

## Also

A running serial logger holds the port and the browser will not see the board.
Stop it first.

## Why it survives ingress

Checked before building: `index.html` has **zero** absolute (`/…`) references —
every link is relative or fully-qualified external. Absolute paths are what break
pages mounted under `/api/hassio_ingress/<token>/`.
