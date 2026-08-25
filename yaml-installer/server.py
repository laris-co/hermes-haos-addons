#!/usr/bin/env python3
"""YAML Installer — pull ESPHome configs from git into /config/esphome.

Ingress-only, no published port. Two actions:
  GET  /            → the UI
  GET  api/preview  → clone the pinned ref, list what WOULD be written (no writes)
  POST api/apply    → do it, with a per-file backup of anything overwritten

Every safety rule here is a trap this fleet actually hit:
 - AppleDouble `._*` files reached an ESPHome build and produced `stray '\\345'`.
 - The Builder lists every TOP-LEVEL `.yaml` as a device, so dropping package
   files in the root creates phantom offline cards — we warn on it.
 - `secrets.yaml` must never come from git; it is refused by name.
 - `map: config:rw` can break Home Assistant itself, so `target` is an allowlist
   checked AGAIN here, not trusted from options.
 - Nothing is Deleted: overwrite backs the old file up first.
"""
import html
import json
import os
import re
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

OPTIONS_FILE = "/data/options.json"
CONFIG_ROOT = "/config"
SUPERVISOR_PEER = "172.30.32.2"          # the only host ingress forwards from
TARGET_ALLOW = {"esphome", "esphome/packages", "www"}
REFUSED_NAMES = {"secrets.yaml"}          # never written from a repo
ALLOWED_EXT = {".yaml", ".yml"}


def opts():
    try:
        with open(OPTIONS_FILE) as f:
            o = json.load(f)
    except Exception:
        o = {}
    return {
        "repo": str(o.get("repo") or "").strip(),
        "ref": str(o.get("ref") or "main").strip(),
        "subdir": str(o.get("subdir") or "").strip().strip("/"),
        "target": str(o.get("target") or "esphome").strip(),
        "mode": str(o.get("mode") or "safe").strip(),
    }


def resolve_target(target):
    """Allowlist, then confirm the resolved path really stays under /config.

    The allowlist alone is not enough — a symlink or a `..` that slips past it
    would escape /config. So resolve and re-check containment.
    """
    if target not in TARGET_ALLOW:
        raise ValueError(f"target '{target}' not allowed (pick: {sorted(TARGET_ALLOW)})")
    dest = os.path.realpath(os.path.join(CONFIG_ROOT, target))
    root = os.path.realpath(CONFIG_ROOT)
    if dest != root and not dest.startswith(root + os.sep):
        raise ValueError("resolved target escapes /config")
    return dest


def clone(repo, ref):
    if not re.match(r"^https://[\w.-]+/[\w./-]+$", repo):
        raise ValueError("repo must be an https:// git URL")
    tmp = tempfile.mkdtemp(prefix="yi-")
    # --depth 1 on a single ref; no credentials, public repos only by design.
    subprocess.run(
        ["git", "clone", "--depth", "1", "--branch", ref, "--single-branch", repo, tmp],
        check=True, capture_output=True, timeout=120,
    )
    head = subprocess.run(
        ["git", "-C", tmp, "rev-parse", "HEAD"],
        check=True, capture_output=True, text=True,
    ).stdout.strip()
    return tmp, head


def enumerate_yaml(src_root, subdir):
    """Return [(relpath, abspath)] of the .yaml/.yml files that would be copied."""
    base = os.path.join(src_root, subdir) if subdir else src_root
    base = os.path.realpath(base)
    if not base.startswith(os.path.realpath(src_root)):
        raise ValueError("subdir escapes the repo")
    out = []
    for dirpath, _dirs, files in os.walk(base):
        parts = dirpath.split(os.sep)
        # Skip VCS and CI metadata — a repo's .github/workflows/*.yaml are CI
        # definitions, not device configs, and must never land in /config/esphome.
        if ".git" in parts or ".github" in parts:
            continue
        for fn in files:
            if fn.startswith("._"):          # macOS AppleDouble — never
                continue
            ext = os.path.splitext(fn)[1].lower()
            if ext not in ALLOWED_EXT:
                continue
            rel = os.path.relpath(os.path.join(dirpath, fn), base)
            out.append((rel, os.path.join(dirpath, fn)))
    return sorted(out)


def plan(dest, files, mode):
    """Classify each file WITHOUT writing anything."""
    rows = []
    for rel, abspath in files:
        name = os.path.basename(rel)
        target_path = os.path.join(dest, rel)
        top_level = (os.sep not in rel)
        entry = {"rel": rel, "abs": abspath, "target": target_path}
        if name in REFUSED_NAMES:
            entry["action"] = "refuse"
            entry["note"] = "secrets.yaml is never written from git"
        elif os.path.exists(target_path):
            entry["action"] = "overwrite" if mode == "overwrite" else "skip"
            entry["note"] = "exists — will back up" if mode == "overwrite" else "exists — skipped (mode: safe)"
        else:
            entry["action"] = "create"
            entry["note"] = ""
        # The phantom-device warning: a top-level .yaml in the esphome dir shows
        # as a device card. Package/base files usually should be in packages/.
        if top_level and name not in ("secrets.yaml",):
            entry["device_card"] = True
        rows.append(entry)
    return rows


def apply(rows):
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    done = []
    for r in rows:
        if r["action"] in ("skip", "refuse"):
            done.append({**r, "result": "skipped"})
            continue
        os.makedirs(os.path.dirname(r["target"]), exist_ok=True)
        if r["action"] == "overwrite" and os.path.exists(r["target"]):
            bak = f"{r['target']}.bak-{stamp}"
            shutil.copy2(r["target"], bak)          # Nothing is Deleted
            r["backup"] = bak
        shutil.copy2(r["abs"], r["target"])
        done.append({**r, "result": "written"})
    return done


class Handler(BaseHTTPRequestHandler):
    def _peer_ok(self):
        # Ingress forwards from the Supervisor only. Belt-and-braces since there
        # is no nginx allow/deny in front of this python server.
        return self.client_address[0] == SUPERVISOR_PEER

    def _send(self, code, body, ctype="application/json"):
        data = body.encode() if isinstance(body, str) else body
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Security-Policy",
                         "default-src 'none'; style-src 'unsafe-inline'; "
                         "script-src 'unsafe-inline'; connect-src 'self'")
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *a):
        pass

    def do_GET(self):
        if not self._peer_ok():
            self._send(403, "forbidden", "text/plain"); return
        path = self.path.split("?")[0].lstrip("/")
        if path in ("", "index.html"):
            self._send(200, PAGE, "text/html"); return
        if path == "api/preview":
            try:
                o = opts()
                if not o["repo"]:
                    self._send(200, json.dumps({"error": "set the repo option first"})); return
                dest = resolve_target(o["target"])
                tmp, head = clone(o["repo"], o["ref"])
                try:
                    files = enumerate_yaml(tmp, o["subdir"])
                    rows = plan(dest, files, o["mode"])
                finally:
                    shutil.rmtree(tmp, ignore_errors=True)
                self._send(200, json.dumps({
                    "repo": o["repo"], "ref": o["ref"], "head": head,
                    "target": dest, "mode": o["mode"],
                    "rows": [{k: r[k] for k in ("rel", "action", "note")} | (
                             {"device_card": True} if r.get("device_card") else {})
                             for r in rows],
                })); return
            except subprocess.CalledProcessError as e:
                self._send(200, json.dumps({"error": "git: " + e.stderr.decode()[:300]})); return
            except Exception as e:
                self._send(200, json.dumps({"error": str(e)})); return
        self._send(404, "not found", "text/plain")

    def do_POST(self):
        if not self._peer_ok():
            self._send(403, "forbidden", "text/plain"); return
        path = self.path.split("?")[0].lstrip("/")
        if path != "api/apply":
            self._send(404, "not found", "text/plain"); return
        try:
            o = opts()
            dest = resolve_target(o["target"])
            tmp, head = clone(o["repo"], o["ref"])
            try:
                files = enumerate_yaml(tmp, o["subdir"])
                rows = plan(dest, files, o["mode"])
                done = apply(rows)
            finally:
                shutil.rmtree(tmp, ignore_errors=True)
            written = [d["rel"] for d in done if d["result"] == "written"]
            self._send(200, json.dumps({
                "head": head, "target": dest, "mode": o["mode"],
                "written": written, "count": len(written),
                "results": [{k: d.get(k) for k in ("rel", "result", "backup")} for d in done],
            })); return
        except Exception as e:
            self._send(200, json.dumps({"error": str(e)})); return


PAGE = """<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>YAML Installer</title><style>
:root{--a:#4f8cff;--bg:#0d1117;--panel:#111722;--ink:#f4f7fb;--muted:#8b98a9;--line:rgba(255,255,255,.1);
color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);padding:22px;max-width:820px;margin:0 auto}
h1{font-size:20px;margin:0 0 4px}.sub{color:var(--muted);font-size:13px;margin:0 0 18px}
button{background:var(--a);color:#fff;border:0;border-radius:9px;padding:9px 16px;font-size:14px;font-weight:600;cursor:pointer}
button.ghost{background:transparent;border:1px solid var(--line);color:var(--ink)}
button:disabled{opacity:.5;cursor:default}
.row{display:flex;gap:8px;margin-bottom:16px}
table{width:100%;border-collapse:collapse;font-size:13px;margin-top:8px}
th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line)}
th{color:var(--muted)}.mono{font-family:ui-monospace,Menlo,monospace}
.pill{font-size:11px;padding:2px 8px;border-radius:999px}
.create{background:rgba(46,204,113,.18);color:#8ff0be}
.overwrite{background:rgba(243,156,18,.18);color:#ffd089}
.skip{background:rgba(139,152,169,.18);color:var(--muted)}
.refuse{background:rgba(231,76,60,.2);color:#ff9c8f}
.warn{color:#ffd089;font-size:12px}.err{color:#ff9c8f}
footer{margin-top:20px;color:var(--muted);font-size:12px;font-family:ui-monospace,Menlo,monospace}
</style></head><body>
<h1>YAML Installer</h1>
<p class="sub">Pulls .yaml from the git repo in this add-on's Configuration into the chosen /config target.
Preview first — nothing is written until you Apply.</p>
<div class="row">
  <button id="prev" class="ghost">Preview</button>
  <button id="apply" disabled>Apply</button>
</div>
<div id="meta" class="sub"></div>
<div id="out"></div>
<footer>backup on overwrite · secrets.yaml refused · AppleDouble skipped · target allowlisted</footer>
<script>
const out=document.getElementById('out'),meta=document.getElementById('meta'),
      bP=document.getElementById('prev'),bA=document.getElementById('apply');
function esc(s){return (s+'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}
async function preview(){
  bP.disabled=true;meta.textContent='cloning…';out.innerHTML='';bA.disabled=true;
  try{
    const r=await fetch('api/preview'),d=await r.json();
    if(d.error){meta.innerHTML='<span class=err>'+esc(d.error)+'</span>';return}
    meta.innerHTML='<span class=mono>'+esc(d.repo)+' @ '+esc(d.ref)+' ('+esc((d.head||'').slice(0,7))+
      ') → '+esc(d.target)+' · mode '+esc(d.mode)+'</span>';
    let rows=d.rows.map(x=>'<tr><td class=mono>'+esc(x.rel)+
      (x.device_card?' <span class=warn title="top-level .yaml shows as a device card">⚠ device</span>':'')+
      '</td><td><span class="pill '+x.action+'">'+x.action+'</span></td><td class=sub>'+esc(x.note||'')+'</td></tr>').join('');
    out.innerHTML='<table><tr><th>file</th><th>action</th><th>note</th></tr>'+rows+'</table>';
    bA.disabled = !d.rows.some(x=>x.action==='create'||x.action==='overwrite');
  }catch(e){meta.innerHTML='<span class=err>'+esc(e)+'</span>'}
  finally{bP.disabled=false}
}
async function apply(){
  if(!confirm('Write these files into /config?'))return;
  bA.disabled=true;meta.textContent='writing…';
  try{
    const r=await fetch('api/apply',{method:'POST'}),d=await r.json();
    if(d.error){meta.innerHTML='<span class=err>'+esc(d.error)+'</span>';return}
    meta.innerHTML='<span class=mono>wrote '+d.count+' file(s) → '+esc(d.target)+'</span>';
    out.innerHTML='<table><tr><th>file</th><th>result</th><th>backup</th></tr>'+
      d.results.map(x=>'<tr><td class=mono>'+esc(x.rel)+'</td><td>'+esc(x.result)+
      '</td><td class="mono sub">'+esc(x.backup||'')+'</td></tr>').join('')+'</table>';
  }catch(e){meta.innerHTML='<span class=err>'+esc(e)+'</span>'}
}
bP.onclick=preview;bA.onclick=apply;
</script></body></html>"""


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 8099), Handler).serve_forever()
