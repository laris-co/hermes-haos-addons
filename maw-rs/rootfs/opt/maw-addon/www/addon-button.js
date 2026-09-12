// Floating "new session" button, injected into maw-ui by nginx.
//
// maw-ui has no way to create a tmux session — maw serve exposes no endpoint
// for it, so the UI could not offer one. This adds the button and calls the
// add-on's own session-api.py.
//
// Deliberately plain DOM in its own element: maw-ui is a prebuilt React
// bundle and nothing here touches its tree, so a UI version bump cannot break
// this and this cannot break the UI.
(function () {
  "use strict";

  var btn = document.createElement("button");
  btn.textContent = "+ session";
  btn.title = "Create a new tmux session in this add-on";
  btn.setAttribute("style", [
    "position:fixed",
    "left:14px",
    "bottom:14px",
    "z-index:2147483647",
    "padding:7px 13px",
    "font:600 12px/1 ui-monospace,SFMono-Regular,Menlo,monospace",
    "letter-spacing:.04em",
    "color:#0d0d0d",
    "background:#7dd3fc",
    "border:0",
    "border-radius:6px",
    "cursor:pointer",
    "box-shadow:0 2px 10px rgba(0,0,0,.45)",
  ].join(";"));

  function busy(on, label) {
    btn.disabled = on;
    btn.style.opacity = on ? "0.6" : "1";
    btn.textContent = label;
  }

  btn.addEventListener("click", function () {
    var suggested = "maw-" + Date.now().toString(36).slice(-4);
    var name = window.prompt("New tmux session name", suggested);
    if (name === null) return;

    busy(true, "creating…");
    // Relative URL: the page lives under /api/hassio_ingress/<token>/, and a
    // root-absolute path would leave that prefix and hit Home Assistant.
    fetch("addon/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    })
      .then(function (r) {
        return r.json().then(function (b) {
          return { ok: r.ok, body: b };
        });
      })
      .then(function (res) {
        if (!res.ok) throw new Error(res.body.error || "failed");
        // maw-ui reads the session list on load; a reload is the honest way
        // to show the new one without reaching into its state.
        window.location.reload();
      })
      .catch(function (e) {
        busy(false, "+ session");
        window.alert("Could not create session: " + e.message);
      });
  });

  function attach() {
    document.body.appendChild(btn);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attach);
  } else {
    attach();
  }
})();
