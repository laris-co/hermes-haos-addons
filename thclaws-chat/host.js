(() => {
  "use strict";

  const iframe = document.getElementById("chatbot");
  const status = document.getElementById("status");
  const pendingFrames = [];
  const parentOnly = new Set(["ready", "hotkey", "ui"]);
  let socket = null;
  let reconnectDelay = 250;
  let reconnectTimer = null;
  let shellReady = false;
  let deepLinkRequest = 0;

  function routeWindow() {
    try {
      if (window.top && window.top.location.origin === location.origin) return window.top;
    } catch { /* cross-origin embed: keep the hash on this frame */ }
    return window;
  }

  function sessionFromHash() {
    let raw;
    try {
      raw = decodeURIComponent(routeWindow().location.hash.replace(/^#/, "").trim());
    } catch {
      return "";
    }
    const value = raw.startsWith("session=") ? raw.slice("session=".length) : raw;
    return /^[A-Za-z0-9._:-]{1,200}$/.test(value) ? value : "";
  }

  function setSessionHash(id) {
    const target = routeWindow();
    const next = id ? `#session=${encodeURIComponent(id)}` : "";
    if (target.location.hash === next) return;
    target.history.replaceState(
      target.history.state,
      "",
      `${target.location.pathname}${target.location.search}${next}`,
    );
  }

  async function openDeepLinkedSession() {
    const id = sessionFromHash();
    if (!id || !shellReady) return;
    const request = ++deepLinkRequest;

    // The built-in chatbot owns transcript rendering. Its classic-script
    // `openSession` function is the same path its history buttons call; wait
    // for main.js to finish loading, then use it instead of duplicating session
    // rendering in this host wrapper.
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (request !== deepLinkRequest) return;
      const openSession = iframe.contentWindow?.openSession;
      if (typeof openSession === "function") {
        try { await openSession(id); } catch { /* shell renders its own error */ }
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  function websocketUrl() {
    const base = location.href.endsWith("/") ? location.href : `${location.href}/`;
    const url = new URL("ws", base);
    url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
    return url.href;
  }

  function setStatus(text, mode) {
    status.textContent = text;
    status.className = mode || "";
  }

  function postToShell(message) {
    iframe.contentWindow?.postMessage(
      { ns: "thclaws-shell-event", ...message },
      "*",
    );
  }

  function pushHostState() {
    const light = window.matchMedia("(prefers-color-scheme: light)").matches;
    postToShell({ event: "theme", payload: { mode: light ? "light" : "dark" } });
    postToShell({ event: "fullscreen", payload: { active: false } });
  }

  function send(frame) {
    const payload = JSON.stringify(frame);
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(payload);
    } else {
      pendingFrames.push(payload);
      connect();
    }
  }

  function connect() {
    if (
      socket?.readyState === WebSocket.OPEN ||
      socket?.readyState === WebSocket.CONNECTING
    ) return;

    clearTimeout(reconnectTimer);
    setStatus("Connecting to thCLAWS…", shellReady ? "reconnecting" : "");
    socket = new WebSocket(websocketUrl());

    socket.addEventListener("open", () => {
      reconnectDelay = 250;
      socket.send(JSON.stringify({ type: "frontend_ready" }));
      while (pendingFrames.length) socket.send(pendingFrames.shift());
      setStatus("Connected", "ready");
    });

    socket.addEventListener("message", (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message?.type === "gui_shell_event") {
        postToShell(message);
      } else if (message?.type === "provider_update") {
        postToShell({
          event: "model",
          payload: { provider: message.provider, model: message.model },
        });
      }
    });

    socket.addEventListener("close", () => {
      socket = null;
      setStatus("Connection lost · reconnecting…", shellReady ? "reconnecting" : "");
      reconnectTimer = setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, 5000);
    });

    socket.addEventListener("error", () => socket?.close());
  }

  window.addEventListener("message", async (event) => {
    const data = event.data;
    if (
      event.source !== iframe.contentWindow ||
      !data ||
      data.ns !== "thclaws-shell"
    ) return;

    if (data.type === "ready") {
      shellReady = true;
      pushHostState();
      connect();
      void openDeepLinkedSession();
      return;
    }

    if (data.type === "clipboard-write") {
      if (typeof data.text === "string" && data.text) {
        try { await navigator.clipboard.writeText(data.text); } catch { /* best effort */ }
      }
      return;
    }

    if (parentOnly.has(data.type)) return;

    // Keep the outer HA route shareable. Clicking a stored chat updates the
    // URL without reloading; New chat clears it. Pasting a deep link later
    // follows the exact same built-in openSession path.
    if (data.type === "session_load" && typeof data.payload?.loadId === "string") {
      setSessionHash(data.payload.loadId);
    } else if (data.type === "session_new") {
      setSessionHash("");
    } else if (
      data.type === "session_delete" &&
      data.payload?.deleteId === sessionFromHash()
    ) {
      setSessionHash("");
    }

    send({
      type: `gui_shell_${data.type}`,
      id: data.requestId,
      sessionId: data.sessionId ?? "tier1",
      shellId: data.shellId ?? "chatbot",
      ...(data.payload || {}),
    });
  });

  window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", pushHostState);
  routeWindow().addEventListener("hashchange", () => void openDeepLinkedSession());
  connect();
})();
