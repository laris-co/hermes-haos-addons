import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import server  # noqa: E402


class RedactionTests(unittest.TestCase):
    def test_redacts_common_secret_shapes(self):
        samples = {
            "Authorization: Bearer top-secret-token": "top-secret-token",
            'OPENROUTER_API_KEY="sk-thisshouldvanish"': "sk-thisshouldvanish",
            "discord_bot_token=abcdefghijklmnopqrstuv.ABCDEF.abcdefghijklmnopqrstuvwxyz":
                "abcdefghijklmnopqrstuv.ABCDEF.abcdefghijklmnopqrstuvwxyz",
            "https://user:password@example.test/v1": "password@example.test",
        }
        for raw, forbidden in samples.items():
            with self.subTest(raw=raw):
                self.assertNotIn(forbidden, server.redact(raw))

    def test_removes_ansi_and_preserves_message(self):
        clean = server.redact("\x1b[31mERROR\x1b[0m provider failed")
        self.assertEqual(clean, "ERROR provider failed")


class ClassificationTests(unittest.TestCase):
    def test_levels(self):
        self.assertEqual(server.classify("Provider authentication failed"), "error")
        self.assertEqual(server.classify("WARNING retrying"), "warning")
        self.assertEqual(server.classify("DEBUG request"), "debug")
        self.assertEqual(server.classify("Gateway started"), "info")


class OptionTests(unittest.TestCase):
    def test_bounds(self):
        self.assertEqual(server.bounded_int("0", 1, 1000, 250), 1)
        self.assertEqual(server.bounded_int("2000", 1, 1000, 250), 1000)
        self.assertEqual(server.bounded_int("wat", 1, 1000, 250), 250)

    def test_ingress_client_allowlist(self):
        self.assertTrue(server.client_allowed("127.0.0.1"))
        self.assertTrue(server.client_allowed("172.30.32.2"))
        self.assertFalse(server.client_allowed("172.30.32.3"))


if __name__ == "__main__":
    unittest.main()
