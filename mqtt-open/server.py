#!/usr/bin/env python3
"""Let dashboards read MQTT without a password, without letting them write.

core_mosquitto folds every *.conf in its customize folder into its own config.
This writes exactly one of them.

The default is READ-ONLY on purpose. "Remove the password" usually means "stop
making my wall display ask for one" — it rarely means "let anything on the
network publish to it". Those are different, and on a display that tells
children whether the air is safe the difference matters: a writable topic is a
display that can be made to lie. Anonymous publish is therefore opt-in, loudly.

Rolling back is deleting the file this writes and restarting core_mosquitto.
"""

import html
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

OPTIONS_FILE = "/data/options.json"
SHARE_DIR = "/share/mosquitto"
CONF_NAME = "anonymous-read.conf"
ACL_NAME = "anonymous-read.acl"


def die(msg):
    print(f"[mqtt-open] FATAL: {msg}", flush=True)
    sys.exit(1)


def render():
    with open(OPTIONS_FILE) as f:
        opt = json.load(f)

    topics = [t.strip() for t in opt.get("read_topics", []) if t and t.strip()]
    if not topics:
        die("no read_topics configured — refusing to open a broker with nothing scoped")

    # A bare '#' is refused in code rather than in a comment. An unscoped
    # subscription against the fleet broker once measured ~109 GB/day, and an
    # anonymous one is worse: nothing authenticates the client causing it.
    for t in topics:
        if t.strip() in ("#", "/#", "+/#"):
            die(f"refusing an unscoped anonymous subscription: {t!r}")

    allow_pub = bool(opt.get("allow_anonymous_publish", False))
    os.makedirs(SHARE_DIR, exist_ok=True)

    acl_path = os.path.join(SHARE_DIR, ACL_NAME)
    acl = [
        "# Written by the mqtt-open add-on. Edit the add-on's options, not this file.",
        "#",
        "# Lines before the first `user` stanza apply to ANONYMOUS clients.",
        "# Authenticated users are unaffected by this file and keep their normal",
        "# access, which is why adding it cannot lock Home Assistant out.",
        "",
    ]
    verb = "readwrite" if allow_pub else "read"
    for t in topics:
        acl.append(f"topic {verb} {t}")
    if allow_pub:
        acl += [
            "",
            "# allow_anonymous_publish is ON. Any device on this network can now write",
            "# these topics, including the readings a wall display shows. Turn it off",
            "# unless something genuinely needs to publish without credentials.",
        ]
    with open(acl_path, "w") as f:
        f.write("\n".join(acl) + "\n")

    conf_path = os.path.join(SHARE_DIR, CONF_NAME)
    conf = [
        "# Written by the mqtt-open add-on. Delete this file and restart",
        "# core_mosquitto to put the password back.",
        "allow_anonymous true",
        f"acl_file {acl_path}",
    ]
    with open(conf_path, "w") as f:
        f.write("\n".join(conf) + "\n")

    print(f"[mqtt-open] wrote {conf_path} and {acl_path} — "
          f"{len(topics)} topic(s), publish={'ON' if allow_pub else 'off'}", flush=True)
    return {"conf": conf_path, "acl": acl_path, "topics": topics, "publish": allow_pub}


def page(info):
    rows = "".join(f"<li><code>{html.escape(t)}</code></li>" for t in info["topics"])
    pub = ("<p class='warn'>Anonymous <b>publish is ON</b>. Anything on this network can write "
           "these topics, including readings shown to children. Turn it off unless something "
           "genuinely needs it.</p>") if info["publish"] else \
          ("<p>Anonymous clients may <b>subscribe only</b>. They cannot publish, so a wall "
           "display cannot be made to show a reading nobody measured.</p>")
    return f"""<!doctype html><meta charset=utf-8><title>MQTT Open Read</title>
<style>body{{font:15px/1.6 system-ui,sans-serif;max-width:44rem;margin:3rem auto;padding:0 1.2rem;
color:#222}}code{{background:#f2f2f2;padding:.1rem .35rem;border-radius:4px}}
.warn{{background:#fff4f4;border-left:3px solid #c33;padding:.7rem .9rem}}
li{{margin:.15rem 0}}</style>
<h1>MQTT Open Read</h1>
<p>Wrote <code>{html.escape(info['conf'])}</code>.</p>
{pub}
<p>Anonymous clients are scoped to:</p><ul>{rows}</ul>
<p>Restart <b>Mosquitto broker</b> for this to take effect. To undo it, delete
<code>{html.escape(info['conf'])}</code> and restart the broker again.</p>"""


def main():
    info = render()
    body = page(info).encode()

    class H(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def do_GET(self):
            if self.path not in ("/", "/index.html"):
                self.send_response(404)
                self.end_headers()
                self.wfile.write(b"not found")
                return
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    ThreadingHTTPServer(("0.0.0.0", 8099), H).serve_forever()


if __name__ == "__main__":
    main()
