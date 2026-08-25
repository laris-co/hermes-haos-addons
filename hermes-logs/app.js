(() => {
  "use strict";

  const state = {
    entries: [],
    level: "all",
    paused: false,
    loading: false,
    interval: 3000,
    timer: null,
  };

  const $ = (id) => document.getElementById(id);
  const logList = $("logLines");
  const apiBase = `${location.href.split(/[?#]/)[0].replace(/\/?$/, "/")}api/`;

  function endpoint(path) {
    return new URL(path, apiBase).href;
  }

  function setConnection(mode, text) {
    $("connection").dataset.state = mode;
    $("connectionText").textContent = text;
  }

  function visibleEntries() {
    const needle = $("search").value.trim().toLowerCase();
    return state.entries.filter((entry) => {
      const levelMatch = state.level === "all" || entry.level === state.level;
      return levelMatch && (!needle || entry.text.toLowerCase().includes(needle));
    });
  }

  function nearBottom() {
    return logList.scrollHeight - logList.scrollTop - logList.clientHeight < 80;
  }

  function render() {
    const keepBottom = nearBottom();
    const entries = visibleEntries();
    const fragment = document.createDocumentFragment();
    for (const entry of entries) {
      const item = document.createElement("li");
      item.className = `log-line ${entry.level}`;
      const dot = document.createElement("span");
      dot.className = "dot";
      const text = document.createElement("pre");
      text.textContent = entry.text || " ";
      item.append(dot, text);
      fragment.append(item);
    }
    logList.replaceChildren(fragment);
    $("visibleCount").textContent = `${entries.length} visible`;
    $("empty").hidden = entries.length !== 0;
    if (keepBottom) logList.scrollTop = logList.scrollHeight;
    $("jumpLatest").hidden = nearBottom();
  }

  async function loadConfig() {
    const response = await fetch(endpoint("config"), { cache: "no-store" });
    if (!response.ok) throw new Error(`Configuration HTTP ${response.status}`);
    const config = await response.json();
    $("target").textContent = config.target;
    $("sourceLabel").textContent = `supervisor://addons/${config.target}/logs`;
    $("lineLimit").value = String(config.default_lines);
    state.interval = config.refresh_seconds * 1000;
    updateRawLink();
  }

  async function refresh() {
    if (state.paused || state.loading) return;
    state.loading = true;
    $("refresh").textContent = "Loading…";
    const limit = $("lineLimit").value;
    try {
      const response = await fetch(endpoint(`logs?lines=${encodeURIComponent(limit)}`), { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || `HTTP ${response.status}`);
      state.entries = payload.lines;
      $("errorCount").textContent = payload.counts.error;
      $("warningCount").textContent = payload.counts.warning;
      $("lineCount").textContent = payload.count;
      $("lastUpdated").textContent = new Date(payload.fetched_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      setConnection("online", state.paused ? "Paused" : `Live · ${Math.round(state.interval / 1000)}s`);
      render();
    } catch (error) {
      setConnection("error", error.message || "Log fetch failed");
    } finally {
      state.loading = false;
      $("refresh").textContent = "Refresh";
    }
  }

  function schedule() {
    clearInterval(state.timer);
    state.timer = setInterval(refresh, state.interval);
  }

  function updateRawLink() {
    $("rawLink").href = endpoint(`logs/raw?lines=${encodeURIComponent($("lineLimit").value)}`);
  }

  $("search").addEventListener("input", render);
  $("lineLimit").addEventListener("change", () => {
    updateRawLink();
    void refresh();
  });
  $("refresh").addEventListener("click", () => {
    if (state.paused) {
      state.paused = false;
      $("pause").dataset.paused = "false";
      $("pause").textContent = "Pause";
    }
    void refresh();
  });
  $("pause").addEventListener("click", () => {
    state.paused = !state.paused;
    $("pause").dataset.paused = String(state.paused);
    $("pause").textContent = state.paused ? "Resume" : "Pause";
    setConnection("online", state.paused ? "Paused" : `Live · ${Math.round(state.interval / 1000)}s`);
    if (!state.paused) void refresh();
  });
  document.querySelectorAll(".level").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".level").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      state.level = button.dataset.level;
      render();
    });
  });
  $("copy").addEventListener("click", async () => {
    const text = visibleEntries().map((entry) => entry.text).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      $("copy").textContent = "✓";
      setTimeout(() => { $("copy").textContent = "⧉"; }, 1000);
    } catch { /* clipboard may be blocked inside an iframe */ }
  });
  logList.addEventListener("scroll", () => { $("jumpLatest").hidden = nearBottom(); });
  $("jumpLatest").addEventListener("click", () => { logList.scrollTop = logList.scrollHeight; });
  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      $("search").focus();
    }
  });

  loadConfig()
    .then(() => {
      schedule();
      return refresh();
    })
    .catch((error) => setConnection("error", error.message || "Cannot start"));
})();
