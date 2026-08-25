#!/usr/bin/env python3
"""Render /share/mosquitto/<connection_name>.conf from this add-on's options.

core_mosquitto reads customize.folder (/share/mosquitto by default) and folds
every *.conf found there into its own config. This writes exactly one file,
re-rendered fresh from options on every start (never edited in place, so
there is nothing to drift).

The one rule enforced in CODE, not just documented: no bare "#" topic. A bare
subscription on this fleet's broker measured ~109 GB/day against a guest that
has sat at single-digit GB free more than once today.
"""
import html
import json
import os

OPTIONS_FILE = "/data/options.json"
SHARE_DIR = "/share/mosquitto"


def die(msg):
    print(f"[mqtt-bridge-writer] FATAL: {msg}")
    raise SystemExit(1)


def render():
    with open(OPTIONS_FILE) as f:
        o = json.load(f)

    name = (o.get("connection_name") or "bridge").strip()
    host = (o.get("remote_host") or "").strip()
    port = int(o.get("remote_port") or 1883)
    user = (o.get("remote_username") or "").strip()
    pw = o.get("remote_password") or ""
    topics = [t.strip() for t in (o.get("topics") or []) if t.strip()]

    if not host:
        die("remote_host is empty")
    if not topics:
        die("no topics configured — refusing to write a bridge with nothing scoped")
    for t in topics:
        if t == "#" or t.split("/")[0] == "#":
            die(f"topic '{t}' is a bare wildcard subscription — refused")

    os.makedirs(SHARE_DIR, exist_ok=True)
    path = os.path.join(SHARE_DIR, f"{name}.conf")

    lines = [
        f"connection {name}",
        f"address {host}:{port}",
    ]
    if user:
        lines.append(f"remote_username {user}")
    if pw:
        lines.append(f"remote_password {pw}")
    for t in topics:
        lines.append(f"topic {t} in")
    lines += [
        "bridge_protocol_version mqttv311",
        "cleansession true",
        "notifications false",
        "",
    ]

    with open(path, "w") as f:
        f.write("\n".join(lines))

    print(f"[mqtt-bridge-writer] wrote {path} — {len(topics)} topic(s), host={host}")
    return {"path": path, "name": name, "host": host, "port": port,
            "user": user, "has_password": bool(pw), "topics": topics}


def status_page(info):
    rows = "".join(f"<li><code>{html.escape(t)}</code></li>" for t in info["topics"])
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>MQTT Bridge</title><style>
body{{font-family:ui-sans-serif,system-ui,sans-serif;background:#0d1117;color:#f4f7fb;
padding:32px;max-width:640px;margin:0 auto}}
h1{{font-size:20px}}code{{background:#111722;padding:2px 6px;border-radius:5px}}
.warn{{color:#ffd089;font-size:13px}}li{{margin:4px 0}}
</style></head><body>
<h1>MQTT Bridge Writer</h1>
<p>Rendered <code>{html.escape(info['path'])}</code></p>
<p>connection <code>{html.escape(info['name'])}</code> &rarr;
<code>{html.escape(info['host'])}:{info['port']}</code>
user <code>{html.escape(info['user'] or '-')}</code>
password <code>{'set' if info['has_password'] else 'NOT set'}</code></p>
<p><b>Topics ({len(info['topics'])})</b>:</p><ul>{rows}</ul>
<p class="warn">Enable this bridge on core_mosquitto: options.customize.active = true,
then restart core_mosquitto.</p>
</body></html>"""


if __name__ == "__main__":
    info = render()
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

    class H(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def do_GET(self):
            if self.client_address[0] != "172.30.32.2":
                self.send_response(403); self.end_headers(); self.wfile.write(b"forbidden"); return
            body = status_page(info).encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    ThreadingHTTPServer(("0.0.0.0", 8099), H).serve_forever()
