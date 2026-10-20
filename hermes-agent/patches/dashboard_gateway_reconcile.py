"""Enable an opt-in for gateway reconciliation in dashboard containers."""

from __future__ import annotations

import sys
from pathlib import Path


_UPSTREAM_GUARD = "if _is_dashboard_container(_read_container_argv()):"
_PATCHED_GUARD = """if (
        _is_dashboard_container(_read_container_argv())
        and os.environ.get("HERMES_DASHBOARD_RECONCILE_GATEWAYS") != "1"
    ):"""


def patch_source(source: str) -> str:
    """Patch the pinned upstream dashboard skip guard exactly once."""
    count = source.count(_UPSTREAM_GUARD)
    if count != 1:
        raise ValueError(
            f"expected one upstream dashboard reconciliation guard, found {count}"
        )
    return source.replace(_UPSTREAM_GUARD, _PATCHED_GUARD, 1)


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: dashboard_gateway_reconcile.py <container_boot.py>")
    path = Path(sys.argv[1])
    original = path.read_text(encoding="utf-8")
    patched = patch_source(original)
    compile(patched, str(path), "exec")
    path.write_text(patched, encoding="utf-8")


if __name__ == "__main__":
    main()
