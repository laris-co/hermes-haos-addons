#!/usr/bin/env python3
"""Minimal tmux session creator for the add-on's UI button.

maw serve exposes /api/sessions (list), /api/wake (needs a real oracle repo)
and /api/send, but nothing that simply creates an empty tmux session — and
maw-ui therefore has no button for it. This supplies the one endpoint that
was missing.

Bound to loopback: nginx is the only thing that reaches it, and nginx is
only reachable through Supervisor's authenticated ingress.
"""

import json
import re
import subprocess
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT = 8399
# tmux treats "." and ":" as target separators, so a name containing them
# would address a window or pane rather than name a session. Everything
# outside this set is rejected rather than sanitised, so the caller always
# gets back the name it asked for.
NAME = re.compile(r"^[A-Za-z0-9_-]{1,32}$")


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path.rstrip("/") != "/session":
            return self._send(404, {"error": "not found"})

        length = int(self.headers.get("Content-Length") or 0)
        if length > 4096:
            return self._send(413, {"error": "body too large"})
        try:
            data = json.loads(self.rfile.read(length) or b"{}")
        except ValueError:
            return self._send(400, {"error": "body is not JSON"})

        name = str(data.get("name") or "").strip()
        if not NAME.match(name):
            return self._send(
                400,
                {"error": "name must be 1-32 chars of A-Z a-z 0-9 _ -"},
            )

        # List form, never a shell string: `name` reaches tmux as one argv
        # entry, so it cannot be read as further arguments or shell syntax.
        proc = subprocess.run(
            ["tmux", "new-session", "-d", "-s", name],
            capture_output=True,
            text=True,
        )
        if proc.returncode != 0:
            err = (proc.stderr or proc.stdout).strip()
            # tmux says "duplicate session: x" and exits 1; that is a
            # conflict, not a server fault.
            code = 409 if "duplicate session" in err else 500
            return self._send(code, {"error": err or "tmux failed"})

        return self._send(201, {"ok": True, "name": name})

    def log_message(self, fmt, *args):
        print("[session-api] " + (fmt % args), flush=True)


if __name__ == "__main__":
    HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
