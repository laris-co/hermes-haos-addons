"""Regression tests for the pinned container_boot dashboard guard patch."""

from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "patches"))
from dashboard_gateway_reconcile import patch_source  # noqa: E402


_UPSTREAM_FIXTURE = '''import os

def _is_dashboard_container(argv):
    return bool(argv) and argv[0] == "dashboard"

def _read_container_argv():
    return ["dashboard"]

def main():
    if _is_dashboard_container(_read_container_argv()):
        return "skipped"
    return "reconciled"
'''


class DashboardGatewayReconcileTests(unittest.TestCase):
    def test_dashboard_reconciles_when_addon_opt_in_is_set(self):
        patched = patch_source(_UPSTREAM_FIXTURE)
        namespace: dict[str, object] = {}
        exec(compile(patched, "container_boot.py", "exec"), namespace)

        prior = os.environ.get("HERMES_DASHBOARD_RECONCILE_GATEWAYS")
        try:
            os.environ["HERMES_DASHBOARD_RECONCILE_GATEWAYS"] = "1"
            self.assertEqual(namespace["main"](), "reconciled")
        finally:
            if prior is None:
                os.environ.pop("HERMES_DASHBOARD_RECONCILE_GATEWAYS", None)
            else:
                os.environ["HERMES_DASHBOARD_RECONCILE_GATEWAYS"] = prior

    def test_dashboard_still_skips_without_opt_in(self):
        patched = patch_source(_UPSTREAM_FIXTURE)
        namespace: dict[str, object] = {}
        exec(compile(patched, "container_boot.py", "exec"), namespace)

        prior = os.environ.pop("HERMES_DASHBOARD_RECONCILE_GATEWAYS", None)
        try:
            self.assertEqual(namespace["main"](), "skipped")
        finally:
            if prior is not None:
                os.environ["HERMES_DASHBOARD_RECONCILE_GATEWAYS"] = prior

    def test_patch_fails_closed_if_pinned_guard_changed(self):
        with self.assertRaises(ValueError):
            patch_source("def main():\n    return 0\n")


if __name__ == "__main__":
    unittest.main()
