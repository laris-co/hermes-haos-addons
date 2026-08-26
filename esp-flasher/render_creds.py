#!/usr/bin/env python3
"""Render the wall displays' broker credential from this add-on's own options.

Runs once at container start, before nginx. Reads /data/options.json (Supervisor-
managed, set through THIS add-on's Configuration tab — never git, never the
image) and writes one small JSON file the wall pages fetch same-origin.

Why this exists rather than a password typed into each browser: a value in
localStorage lives in ONE browser profile on ONE device. A value rendered here
is served to every device that opens the sidebar, which is what "just works
everywhere" actually requires without putting the password in source control.

Blank options render blank output — every wall already falls back to its normal
?u=/?p=/"s" flow when this file has no credential in it, so leaving the option
empty is silently safe, not a broken state.
"""

import json
import os

OPTIONS_FILE = "/data/options.json"
OUT_PATH = "/usr/share/esp-flasher/wall/_creds.json"


def main():
    user, password = "", ""
    if os.path.exists(OPTIONS_FILE):
        with open(OPTIONS_FILE) as f:
            opt = json.load(f)
        user = (opt.get("mqtt_user") or "").strip()
        password = opt.get("mqtt_password") or ""

    # Never let a corrupt/partial value produce a broken JSON file — the wall's
    # own fetch() error handling then just falls through, same as no file at all.
    with open(OUT_PATH, "w") as f:
        json.dump({"user": user, "pass": password}, f)

    print(f"[render_creds] wrote {OUT_PATH} — "
          f"{'credential set' if user else 'blank (no option configured)'}", flush=True)


if __name__ == "__main__":
    main()
