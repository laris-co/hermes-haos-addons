#!/usr/bin/env python3
"""Ingress-only Hermes Gateway log viewer.

The Supervisor credential remains server-side. Browser clients only receive a
bounded, redacted copy of the selected add-on's text log.
"""

from __future__ import annotations

import json
import ipaddress
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

APP_DIR = Path(__file__).resolve().parent
OPTIONS_PATH = Path(os.environ.get("OPTIONS_PATH", "/data/options.json"))
SUPERVISOR_URL = os.environ.get("SUPERVISOR_URL", "http://supervisor").rstrip("/")
MAX_RESPONSE_BYTES = 2 * 1024 * 1024
SLUG_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]{0,127}$")
ALLOWED_CLIENTS = (
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("172.30.32.2/32"),
)
ANSI_PATTERN = re.compile(r"\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\))")

SECRET_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (
        re.compile(r"(?i)(authorization\s*[:=]\s*bearer\s+)[^\s,;]+"),
        r"\1[REDACTED]",
    ),
    (
        re.compile(
            r"(?i)((?:api[_-]?key|token|secret|password|client[_-]?secret)"
            r"[\"']?\s*[:=]\s*[\"']?)([^\"'\s,;}]+)"
        ),
        r"\1[REDACTED]",
    ),
    (re.compile(r"\bsk-[A-Za-z0-9_-]{8,}\b"), "[REDACTED_KEY]"),
    (
        re.compile(
            r"\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{6,}\."
            r"[A-Za-z0-9_-]{20,}\b"
        ),
        "[REDACTED_TOKEN]",
    ),
    (
        re.compile(r"(?i)(https?://[^\s/:@]+:)[^\s/@]+(@)"),
        r"\1[REDACTED]\2",
    ),
)

CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
}


class LogViewerError(RuntimeError):
    """A safe-to-display log viewer failure."""

    def __init__(self, message: str, status: int = HTTPStatus.BAD_GATEWAY):
        super().__init__(message)
        self.status = status


def load_options() -> dict[str, Any]:
    defaults: dict[str, Any] = {
        "target_addon": "a90308c2_hermes_gateway",
        "default_lines": 250,
        "refresh_seconds": 3,
    }
    try:
        supplied = json.loads(OPTIONS_PATH.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        supplied = {}
    if isinstance(supplied, dict):
        defaults.update(supplied)

    target = str(defaults["target_addon"]).strip()
    if not SLUG_PATTERN.fullmatch(target):
        raise SystemExit("target_addon must be a valid Supervisor add-on slug")
    defaults["target_addon"] = target
    defaults["default_lines"] = bounded_int(defaults["default_lines"], 50, 1000, 250)
    defaults["refresh_seconds"] = bounded_int(defaults["refresh_seconds"], 1, 60, 3)
    return defaults


def bounded_int(value: Any, minimum: int, maximum: int, fallback: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return fallback
    return min(maximum, max(minimum, parsed))


def redact(text: str) -> str:
    """Remove terminal escapes and common credential shapes from log text."""
    clean = ANSI_PATTERN.sub("", text).replace("\x00", "")
    for pattern, replacement in SECRET_PATTERNS:
        clean = pattern.sub(replacement, clean)
    return clean


def client_allowed(address: str) -> bool:
    """Accept loopback probes and Home Assistant Supervisor's ingress proxy."""
    if os.environ.get("ALLOW_ALL_CLIENTS") == "1":
        return True
    try:
        client = ipaddress.ip_address(address)
    except ValueError:
        return False
    return any(client in network for network in ALLOWED_CLIENTS)


def classify(line: str) -> str:
    normalized = line.lower()
    if re.search(r"\b(error|fatal|critical|exception|traceback|failed|failure)\b", normalized):
        return "error"
    if re.search(r"\b(warn|warning|deprecated|retry|unauthorized|forbidden)\b", normalized):
        return "warning"
    if re.search(r"\b(debug|trace)\b", normalized):
        return "debug"
    return "info"


def fetch_logs(target: str, lines: int) -> str:
    token = os.environ.get("SUPERVISOR_TOKEN") or os.environ.get("HASSIO_TOKEN", "")
    if not token:
        raise LogViewerError("Supervisor access is unavailable", HTTPStatus.SERVICE_UNAVAILABLE)

    safe_target = urllib.parse.quote(target, safe="_-abcdefghijklmnopqrstuvwxyz0123456789")
    url = f"{SUPERVISOR_URL}/addons/{safe_target}/logs?lines={lines}"
    request = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "text/plain",
            "User-Agent": "hermes-logs/1.0",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            body = response.read(MAX_RESPONSE_BYTES + 1)
    except urllib.error.HTTPError as error:
        if error.code in (HTTPStatus.UNAUTHORIZED, HTTPStatus.FORBIDDEN):
            raise LogViewerError(
                "Supervisor denied the cross-add-on log read",
                HTTPStatus.BAD_GATEWAY,
            ) from error
        if error.code == HTTPStatus.NOT_FOUND:
            raise LogViewerError("The configured Hermes add-on is not installed") from error
        raise LogViewerError(f"Supervisor log request failed (HTTP {error.code})") from error
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        raise LogViewerError("Supervisor log service is temporarily unreachable") from error

    if len(body) > MAX_RESPONSE_BYTES:
        body = body[-MAX_RESPONSE_BYTES:]
    return redact(body.decode("utf-8", errors="replace"))


class RequestHandler(BaseHTTPRequestHandler):
    server_version = "HermesLogs/1.0"

    @property
    def options(self) -> dict[str, Any]:
        return self.server.options  # type: ignore[attr-defined]

    def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler contract
        if not client_allowed(self.client_address[0]):
            self.send_error(HTTPStatus.FORBIDDEN)
            return
        parsed = urllib.parse.urlsplit(self.path)
        if parsed.path == "/api/health":
            self.send_json(
                {
                    "ok": True,
                    "service": "Hermes Logs",
                    "target": self.options["target_addon"],
                }
            )
            return
        if parsed.path == "/api/config":
            self.send_json(
                {
                    "target": self.options["target_addon"],
                    "default_lines": self.options["default_lines"],
                    "refresh_seconds": self.options["refresh_seconds"],
                    "redacted": True,
                }
            )
            return
        if parsed.path in ("/api/logs", "/api/logs/raw"):
            self.serve_logs(parsed)
            return
        self.serve_asset(parsed.path)

    def serve_logs(self, parsed: urllib.parse.SplitResult) -> None:
        query = urllib.parse.parse_qs(parsed.query)
        lines = bounded_int(
            query.get("lines", [self.options["default_lines"]])[0],
            1,
            1000,
            self.options["default_lines"],
        )
        try:
            text = fetch_logs(self.options["target_addon"], lines)
        except LogViewerError as error:
            self.send_json({"ok": False, "error": str(error)}, status=error.status)
            return

        entries = [
            {"text": line, "level": classify(line)}
            for line in text.splitlines()
        ]
        if parsed.path.endswith("/raw"):
            self.send_bytes(
                ("\n".join(entry["text"] for entry in entries) + "\n").encode(),
                "text/plain; charset=utf-8",
            )
            return

        counts = {"error": 0, "warning": 0, "info": 0, "debug": 0}
        for entry in entries:
            counts[entry["level"]] += 1
        self.send_json(
            {
                "ok": True,
                "target": self.options["target_addon"],
                "requested_lines": lines,
                "count": len(entries),
                "counts": counts,
                "fetched_at": datetime.now(timezone.utc).isoformat(),
                "redacted": True,
                "lines": entries,
            }
        )

    def serve_asset(self, path: str) -> None:
        name = "index.html" if path in ("", "/") else Path(path).name
        if name not in {"index.html", "styles.css", "app.js"}:
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        asset = APP_DIR / name
        try:
            body = asset.read_bytes()
        except OSError:
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        self.send_bytes(body, CONTENT_TYPES[asset.suffix])

    def send_json(self, payload: dict[str, Any], status: int = HTTPStatus.OK) -> None:
        self.send_bytes(
            json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode(),
            "application/json; charset=utf-8",
            status,
        )

    def send_bytes(self, body: bytes, content_type: str, status: int = HTTPStatus.OK) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self'; script-src 'self'; style-src 'self'; "
            "img-src 'self' data:; connect-src 'self'; frame-ancestors 'self'",
        )
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"[http] {self.address_string()} {fmt % args}", flush=True)


class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, address: tuple[str, int], options: dict[str, Any]):
        super().__init__(address, RequestHandler)
        self.options = options


def main() -> None:
    options = load_options()
    port = bounded_int(os.environ.get("PORT", 8099), 1, 65535, 8099)
    print(
        f"Hermes Logs listening on :{port} for {options['target_addon']} "
        "(Supervisor token stays server-side; output is redacted)",
        flush=True,
    )
    Server(("0.0.0.0", port), options).serve_forever()


if __name__ == "__main__":
    main()
