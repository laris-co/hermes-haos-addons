#!/usr/bin/env python3
"""Make Hermes' Vite lazy-route preloads honor its runtime ingress base.

The pinned upstream bundle contains Vite's preload helper as minified code:

    return`/`+e

That leading slash escapes Home Assistant's per-session ingress prefix.  The
Hermes backend already injects ``window.__HERMES_BASE_PATH__`` into every SPA
HTML response, so use that same value for preloads.  Keep the patch deliberately
narrow and fail the image build unless exactly one known helper is changed.
"""

from __future__ import annotations

import sys
from pathlib import Path


NEEDLE = b"return`/`+e"
REPLACEMENT = b"return(window.__HERMES_BASE_PATH__||``)+`/`+e"


def main() -> int:
    if len(sys.argv) != 2:
        raise SystemExit("usage: patch_vite_preload_base.py WEB_DIST_ASSETS")

    assets = Path(sys.argv[1])
    candidates = []
    for path in assets.glob("*.js"):
        data = path.read_bytes()
        if b"vite:preloadError" in data and b"modulepreload" in data:
            candidates.append((path, data))

    matches = sum(data.count(NEEDLE) for _, data in candidates)
    if matches != 1:
        names = ", ".join(path.name for path, _ in candidates) or "none"
        raise SystemExit(
            f"expected exactly one Vite preload base helper, found {matches}; "
            f"candidate bundles: {names}"
        )

    for path, data in candidates:
        if NEEDLE not in data:
            continue
        path.write_bytes(data.replace(NEEDLE, REPLACEMENT, 1))
        print(f"patched ingress-aware Vite preload base in {path.name}")
        break

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
