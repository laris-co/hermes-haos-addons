/* MQTT Board — catalogue on the left, drag onto the board on the right.
   Plain DOM, no framework and no build step. Every URL is RELATIVE because
   Home Assistant serves this under /api/hassio_ingress/<token>/ and that token
   is only known at runtime. */
(function () {
  "use strict";
  var snap = { feeds: [], layout: [], connected: false };
  var filter = "";
  var dragTopic = null;   // topic being dragged in from the catalogue
  var dragTileId = null;  // tile being reordered on the board

  var $ = function (id) { return document.getElementById(id); };
  var grid = $("grid"), cat = $("cat");

  function ago(ms) {
    if (!ms) return "never";
    var s = Math.round((Date.now() - ms) / 1000);
    if (s < 60) return s + "s ago";
    if (s < 3600) return Math.round(s / 60) + "m ago";
    return Math.round(s / 3600) + "h ago";
  }
  // A feed that stopped must LOOK stopped — silence is the most common failure.
  function health(ms) {
    var s = (Date.now() - ms) / 1000;
    return s < 90 ? "" : s < 600 ? "stale" : "dead";
  }
  function feedOf(topic) {
    for (var i = 0; i < snap.feeds.length; i++) if (snap.feeds[i].topic === topic) return snap.feeds[i];
    return null;
  }
  function uid() { return "t" + Math.random().toString(36).slice(2, 9); }

  function saveLayout() {
    fetch("api/layout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(snap.layout)
    }).catch(function () { /* next snapshot re-syncs; nothing to do here */ });
  }

  function spark(hist) {
    if (!hist || hist.length < 2) return "";
    var vals = hist.map(function (p) { return p.v; });
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    var span = (hi - lo) || 1, W = 100, H = 26, n = vals.length;
    var d = vals.map(function (v, i) {
      var x = (i / (n - 1)) * W;
      var y = H - 2 - ((v - lo) / span) * (H - 5);
      return (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
    }).join(" ");
    return '<svg class="sp" viewBox="0 0 100 26" preserveAspectRatio="none">' +
      '<path d="' + d + '" fill="none" stroke="var(--accent)" stroke-width="1.4" ' +
      'vector-effect="non-scaling-stroke"/></svg>';
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function renderCatalogue() {
    var list = snap.feeds.slice().sort(function (a, b) { return a.topic < b.topic ? -1 : 1; });
    if (filter) {
      var f = filter.toLowerCase();
      list = list.filter(function (x) { return x.topic.toLowerCase().indexOf(f) !== -1; });
    }
    if (!list.length) {
      cat.innerHTML = '<div class="hint">' +
        (snap.feeds.length ? "No topic matches that filter." : "Waiting for the first message…") + "</div>";
      return;
    }
    cat.innerHTML = list.slice(0, 400).map(function (x) {
      var v = x.num !== undefined && x.num !== null ? x.num : x.value;
      return '<div class="topic" draggable="true" data-topic="' + esc(x.topic) + '" title="' + esc(x.topic) + '">' +
        esc(x.topic) + '<span class="v">' + esc(String(v).slice(0, 18)) + "</span></div>";
    }).join("");
  }

  function renderBoard() {
    $("count").textContent = snap.layout.length;
    if (!snap.layout.length) {
      grid.className = "empty";
      grid.innerHTML = "Drag topics here";
      return;
    }
    grid.className = "";
    grid.innerHTML = snap.layout.map(function (t) {
      var f = feedOf(t.topic);
      var cls = f ? health(f.last) : "dead";
      var isNum = f && f.num !== undefined && f.num !== null;
      var val = !f ? "—" : (isNum ? f.num : f.value);
      return '<div class="tile ' + cls + '" draggable="true" data-id="' + esc(t.id) + '">' +
        '<button class="x" data-del="' + esc(t.id) + '" title="Remove">&times;</button>' +
        '<div class="t">' + esc(t.topic) + "</div>" +
        (t.label ? '<div class="lab">' + esc(t.label) + "</div>" : "") +
        '<div class="val' + (isNum ? "" : " txt") + '">' + esc(String(val).slice(0, 90)) +
        (isNum && t.unit ? '<span class="unit">' + esc(t.unit) + "</span>" : "") + "</div>" +
        (isNum ? spark(f.history) : "") +
        '<div class="age">' + (f ? ago(f.last) + " · " + f.count + " msg" : "no data yet") + "</div>" +
        "</div>";
    }).join("");
  }

  function render() {
    var d = $("dot"), s = $("stat");
    d.className = "dot" + (snap.connected ? " on" : "");
    s.textContent = snap.connected
      ? snap.feeds.length + " topics · " + (snap.patterns || []).length + " patterns"
      : "disconnected";
    $("err").innerHTML = snap.error ? '<div class="err">MQTT: ' + esc(snap.error) + "</div>"
      : (snap.dropped ? '<div class="err">' + snap.dropped + " topics not catalogued (max_topics " +
          snap.maxTopics + " reached)</div>" : "");
    renderCatalogue();
    renderBoard();
  }

  /* ---------- drag: catalogue -> board ---------- */
  cat.addEventListener("dragstart", function (e) {
    var el = e.target.closest(".topic"); if (!el) return;
    dragTopic = el.getAttribute("data-topic"); dragTileId = null;
    e.dataTransfer.effectAllowed = "copy";
    // Firefox refuses to start a drag unless something is set.
    e.dataTransfer.setData("text/plain", dragTopic);
  });

  grid.addEventListener("dragover", function (e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = dragTileId ? "move" : "copy";
    if (dragTopic) grid.classList.add("over");
    var over = e.target.closest(".tile");
    Array.prototype.forEach.call(grid.querySelectorAll(".tile.overt"), function (n) { n.classList.remove("overt"); });
    if (over && dragTileId && over.getAttribute("data-id") !== dragTileId) over.classList.add("overt");
  });
  grid.addEventListener("dragleave", function () { grid.classList.remove("over"); });

  grid.addEventListener("drop", function (e) {
    e.preventDefault();
    grid.classList.remove("over");
    Array.prototype.forEach.call(grid.querySelectorAll(".tile.overt"), function (n) { n.classList.remove("overt"); });
    var overEl = e.target.closest(".tile");

    if (dragTileId) {                       // reorder
      var from = snap.layout.findIndex(function (t) { return t.id === dragTileId; });
      if (from === -1) return;
      var moved = snap.layout.splice(from, 1)[0];
      var to = overEl ? snap.layout.findIndex(function (t) { return t.id === overEl.getAttribute("data-id"); })
                      : snap.layout.length;
      if (to === -1) to = snap.layout.length;
      snap.layout.splice(to, 0, moved);
    } else if (dragTopic) {                 // add from catalogue
      if (snap.layout.some(function (t) { return t.topic === dragTopic; })) { dragTopic = null; return; }
      var leaf = dragTopic.split("/").filter(Boolean).pop();
      snap.layout.push({ id: uid(), topic: dragTopic, label: leaf });
    } else return;

    dragTopic = null; dragTileId = null;
    renderBoard(); saveLayout();
  });

  /* ---------- drag: reorder tiles ---------- */
  grid.addEventListener("dragstart", function (e) {
    var el = e.target.closest(".tile"); if (!el) return;
    dragTileId = el.getAttribute("data-id"); dragTopic = null;
    el.classList.add("drag");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", dragTileId);
  });
  grid.addEventListener("dragend", function (e) {
    var el = e.target.closest(".tile"); if (el) el.classList.remove("drag");
  });

  grid.addEventListener("click", function (e) {
    var id = e.target.getAttribute && e.target.getAttribute("data-del");
    if (!id) return;
    snap.layout = snap.layout.filter(function (t) { return t.id !== id; });
    renderBoard(); saveLayout();
  });

  $("clear").addEventListener("click", function () {
    if (!snap.layout.length) return;
    if (!confirm("Remove all tiles from the board?")) return;
    snap.layout = []; renderBoard(); saveLayout();
  });

  $("q").addEventListener("input", function (e) { filter = e.target.value; renderCatalogue(); });

  /* ---------- live data ---------- */
  function apply(next) {
    // Don't clobber a layout the user is mid-edit on: keep ours if we have one.
    var mine = snap.layout;
    snap = next;
    if (mine && mine.length && !next.layout.length) snap.layout = mine;
    render();
  }
  fetch("api/snapshot").then(function (r) { return r.json(); }).then(apply).catch(function () {});
  var es = new EventSource("api/stream");
  es.onmessage = function (e) { try { apply(JSON.parse(e.data)); } catch (x) {} };
  // Ages are relative; re-render so "2m ago" doesn't freeze between pushes.
  setInterval(function () { if (snap.layout.length) renderBoard(); }, 10000);
})();
