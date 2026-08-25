#!/usr/bin/env python3
"""Apply the user's branding to the ESPHome Device Builder frontend.

Runs at CONTAINER START (not build time) so the Configuration tab can change
the brand without rebuilding anything.

Two injection sites, each chosen to satisfy the dashboard's own
Content-Security-Policy (read off the live page:
`default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:`):

  * COLOURS -> an inline <style> in index.html. CSP allows inline styles, and
    CSS custom properties inherit THROUGH shadow DOM, so redefining the
    dashboard's own tokens at :root recolours every component at once.

  * NAME + LOGO -> appended to the app bundle (app.<hash>.js), NOT an inline
    <script>. There is no script-src, so scripts fall back to default-src
    'self': inline scripts are BLOCKED, the same-origin bundle is ALLOWED.
    (Learned the hard way: an inline <script> silently does nothing.)

Both injections are marker-delimited and stripped before re-applying, so
restarting with different options replaces the brand instead of stacking it.
"""
import json
import os
import re
import sys

OPTIONS = "/data/options.json"
S_BEGIN, S_END = "<!--brand:style:begin-->", "<!--brand:style:end-->"
J_BEGIN, J_END = "/*brand:js:begin*/", "/*brand:js:end*/"


def opts():
    try:
        with open(OPTIONS) as f:
            return json.load(f)
    except Exception:
        return {}


def find_index():
    """Locate the bundled frontend's index.html inside the upstream image."""
    pats = ("device_builder_frontend", "esphome_dashboard", "dashboard/static")
    for root, _dirs, files in os.walk("/usr"):
        if "index.html" in files and any(p in root for p in pats):
            return os.path.join(root, "index.html")
    for base in ("/usr", "/opt", "/app"):
        for root, _dirs, files in os.walk(base):
            if "index.html" in files and "frontend" in root:
                return os.path.join(root, "index.html")
    return None


def css(o):
    primary = o.get("primary_color") or "#7c4dff"
    accent = o.get("accent_color") or primary
    return """:root{
  --esphome-primary:%(p)s !important;
  --esphome-migration:%(a)s !important;
  --wa-color-brand-fill-loud:%(p)s !important;
  --wa-color-brand-fill-quiet:color-mix(in srgb,%(p)s,transparent 88%%) !important;
  --wa-color-brand-on-quiet:%(p)s !important;
  --primary-color:%(p)s !important;
}""" % {"p": primary, "a": accent}


def js(o):
    payload = {
        "brand": o.get("brand_name") or "My Device Builder",
        "word": o.get("replace_word") or "ESPHome",
        "tagline": o.get("tagline") or "",
        "logo": o.get("logo_svg") or "",
    }
    # Config travels as a JSON literal so no user text is ever concatenated
    # into executable JS (a stray quote in brand_name would break the bundle).
    return (
        "(function(){var C=" + json.dumps(payload) + ";\n"
        "var LOGO=C.logo?('data:image/svg+xml;utf8,'+encodeURIComponent(C.logo)):'';\n"
        "var UP='Create and make your smart devices and automations';\n"
        "function img(e){try{var s=e.getAttribute('src')||'',a=e.getAttribute('alt')||'',"
        "c=e.getAttribute('class')||'';"
        "if(LOGO&&(a===C.word||s.indexOf('/assets/logo/')!==-1||c.indexOf('welcome-logo')!==-1)){"
        "if(e.getAttribute('src')!==LOGO){e.setAttribute('src',LOGO);e.removeAttribute('srcset');}}}catch(x){}}\n"
        "function rep(v){if(!v)return v;var o=v;"
        "if(C.tagline&&o.indexOf(UP)!==-1)o=o.split(UP).join(C.tagline);"
        "if(o.indexOf(C.word)!==-1)o=o.split(C.word).join(C.brand);return o;}\n"
        "function walk(r,d){if(!r||d>20)return;var els;try{els=r.querySelectorAll?r.querySelectorAll('*'):[];}catch(x){return;}\n"
        "for(var i=0;i<els.length;i++){var e=els[i],t=e.tagName;if(t==='SCRIPT'||t==='STYLE')continue;"
        "if(t==='IMG')img(e);var k=e.childNodes;if(k){for(var j=0;j<k.length;j++){var n=k[j];"
        "if(n.nodeType===3){try{var nv=rep(n.nodeValue);if(nv!==n.nodeValue)n.nodeValue=nv;}catch(x){}}}}"
        "if(e.shadowRoot)walk(e.shadowRoot,d+1);}}\n"
        "function run(){try{if(document.title.indexOf(C.word)!==-1)"
        "document.title=document.title.split(C.word).join(C.brand);walk(document,0);}catch(x){}}\n"
        "run();try{if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);}catch(x){}\n"
        # A short sweep, not a MutationObserver: the SPA re-renders into shadow
        # roots on navigation and an observer on the document cannot see inside.
        "try{setInterval(run,700);}catch(x){}})();"
    )


def strip(text, begin, end):
    return re.sub(re.escape(begin) + r".*?" + re.escape(end), "", text, flags=re.S)


def main():
    o = opts()
    idx = find_index()
    if not idx:
        # Fail soft: a plain upstream dashboard beats a container that won't boot.
        print("brand: WARNING frontend index.html not found — running UNBRANDED", file=sys.stderr)
        return
    html = open(idx, encoding="utf-8").read()
    html = strip(html, S_BEGIN, S_END)
    block = "%s<style>%s</style>%s" % (S_BEGIN, css(o), S_END)
    html = html.replace("</head>", block + "</head>", 1) if "</head>" in html else block + html
    open(idx, "w", encoding="utf-8").write(html)

    m = re.search(r'src="([^"]*app[^"]*\.js)"', html)
    if not m:
        print("brand: WARNING app bundle not found — colours only", file=sys.stderr)
        return
    entry = os.path.join(os.path.dirname(idx), os.path.basename(m.group(1)))
    if not os.path.isfile(entry):
        print("brand: WARNING %s missing — colours only" % entry, file=sys.stderr)
        return
    cur = open(entry, encoding="utf-8", errors="surrogatepass").read()
    cur = strip(cur, J_BEGIN, J_END)
    with open(entry, "w", encoding="utf-8", errors="surrogatepass") as f:
        f.write(cur + "\n;" + J_BEGIN + js(o) + J_END + "\n")
    print("brand: applied '%s' (%s)" % (o.get("brand_name"), o.get("primary_color")))


if __name__ == "__main__":
    main()
