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
      return;
    }

    if (data.type === "clipboard-write") {
      if (typeof data.text === "string" && data.text) {
        try { await navigator.clipboard.writeText(data.text); } catch { /* best effort */ }
      }
      return;
    }

    if (parentOnly.has(data.type)) return;

    send({
      type: `gui_shell_${data.type}`,
      id: data.requestId,
      sessionId: data.sessionId ?? "tier1",
      shellId: data.shellId ?? "chatbot",
      ...(data.payload || {}),
    });
  });

  window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", pushHostState);
  connect();
})();
