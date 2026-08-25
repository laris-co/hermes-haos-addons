/**
 * MQTT Board — one MQTT connection, a topic catalogue, and an SSE stream.
 *
 * Shape borrowed from watchboy, which was proven behind HA ingress:
 *  - SSE, not WebSocket: no upgrade negotiation to survive the ingress proxy.
 *  - Routes matched with endsWith(), because Supervisor prefixes every request
 *    with /api/hassio_ingress/<session-token>/ and that token is not knowable
 *    at build time.
 *  - Layout persisted to /data (Supervisor's backed-up volume), not the
 *    browser, so the board is the same for everyone who opens it.
 */
import mqtt from "mqtt";
import { readFileSync, writeFileSync } from "node:fs";

const BROKER = process.env.MB_BROKER ?? "";
const USER = process.env.MB_USER ?? "";
const PASS = process.env.MB_PASS ?? "";
const PORT = Number(process.env.MB_PORT ?? 8099);
const WEB = process.env.MB_WEB ?? "/app/web";
const LAYOUT = process.env.MB_LAYOUT ?? "/data/layout.json";
const MAX_TOPICS = Number(process.env.MB_MAX_TOPICS ?? 500);
const TOPICS = (process.env.MB_TOPICS ?? "").split("\n").map((s) => s.trim()).filter(Boolean);

if (!BROKER) { console.error("mqtt-board: no broker configured"); process.exit(1); }

/** A bare '#' on a busy broker is gigabytes a day. Refuse it, loudly. */
const firehose = TOPICS.filter((t) => t === "#" || t === "/#");
if (firehose.length) {
  console.error("mqtt-board: refusing to subscribe to a bare '#'. List real patterns instead, e.g. sensors/+/state");
  process.exit(1);
}
if (!TOPICS.length) { console.error("mqtt-board: no topics configured"); process.exit(1); }

const MAX_HISTORY = 120;

interface Feed {
  topic: string;
  value: string;      // raw payload, truncated
  num?: number;       // parsed number when the payload is numeric
  count: number;      // messages seen
  last: number;       // epoch ms of last message
  history: { t: number; v: number }[];
}

const feeds = new Map<string, Feed>();
let connected = false;
let lastError: string | undefined;
let dropped = 0;               // topics not catalogued because of MAX_TOPICS
const startedAt = Date.now();

/** Numbers may arrive bare (`23.4`) or inside a JSON object; try both. */
function numeric(raw: string): number | undefined {
  const n = Number(raw);
  if (raw.trim() !== "" && Number.isFinite(n)) return n;
  try {
    const o = JSON.parse(raw);
    if (typeof o === "number" && Number.isFinite(o)) return o;
  } catch { /* not JSON — fine, it's just a string payload */ }
  return undefined;
}

function onMessage(topic: string, buf: Buffer) {
  const raw = buf.toString("utf8");
  let f = feeds.get(topic);
  if (!f) {
    if (feeds.size >= MAX_TOPICS) { dropped++; return; }
    f = { topic, value: "", count: 0, last: 0, history: [] };
    feeds.set(topic, f);
  }
  f.value = raw.length > 512 ? raw.slice(0, 512) + "…" : raw;
  f.count++;
  f.last = Date.now();
  const n = numeric(raw);
  if (n !== undefined) {
    f.num = n;
    f.history.push({ t: f.last, v: n });
    if (f.history.length > MAX_HISTORY) f.history.shift();
  }
}

const client = mqtt.connect(BROKER, {
  username: USER || undefined,
  password: PASS || undefined,
  reconnectPeriod: 10_000,
  clientId: `mqtt-board-${Math.random().toString(16).slice(2, 10)}`,
});
client.on("connect", () => {
  connected = true; lastError = undefined;
  for (const t of TOPICS) client.subscribe(t, (e) => e && console.error("subscribe failed", t, e.message));
  console.log(`mqtt-board: connected, subscribed to ${TOPICS.length} pattern(s)`);
});
client.on("error", (e) => { lastError = e.message; });
client.on("close", () => { connected = false; });
client.on("message", onMessage);

/* ---- layout: server-side so every viewer sees the same board ---- */
interface Tile { id: string; topic: string; label?: string; unit?: string }
let layout: Tile[] = [];
try { layout = JSON.parse(readFileSync(LAYOUT, "utf8")); } catch { layout = []; }
function saveLayout() {
  try { writeFileSync(LAYOUT, JSON.stringify(layout)); }
  catch (e) { console.error("mqtt-board: layout save failed", (e as Error).message); }
}

function snapshot() {
  return {
    connected, error: lastError, startedAt, dropped, maxTopics: MAX_TOPICS,
    patterns: TOPICS,
    layout,
    feeds: [...feeds.values()].map((f) => ({
      topic: f.topic, value: f.value, num: f.num,
      count: f.count, last: f.last, history: f.history,
    })),
  };
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
};

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const p = url.pathname;

    if (p.endsWith("/api/snapshot")) return Response.json(snapshot());

    if (p.endsWith("/api/layout") && req.method === "POST") {
      try {
        const body = await req.json();
        if (!Array.isArray(body)) return new Response("expected an array", { status: 400 });
        layout = body.slice(0, 200).map((t: Tile) => ({
          id: String(t.id).slice(0, 64),
          topic: String(t.topic).slice(0, 256),
          label: t.label ? String(t.label).slice(0, 64) : undefined,
          unit: t.unit ? String(t.unit).slice(0, 16) : undefined,
        }));
        saveLayout();
        return Response.json({ ok: true, tiles: layout.length });
      } catch (e) {
        return new Response(`bad layout: ${(e as Error).message}`, { status: 400 });
      }
    }

    if (p.endsWith("/api/stream")) {
      const stream = new ReadableStream({
        start(ctrl) {
          const send = () => ctrl.enqueue(`data: ${JSON.stringify(snapshot())}\n\n`);
          send();
          const iv = setInterval(send, 2000);
          req.signal.addEventListener("abort", () => { clearInterval(iv); try { ctrl.close(); } catch {} });
        },
      });
      return new Response(stream, {
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          // nginx buffers SSE into uselessness without this.
          "X-Accel-Buffering": "no",
        },
      });
    }

    // static: everything else falls back to the SPA shell
    const name = p.split("/").pop() || "index.html";
    const file = Bun.file(`${WEB}/${name.includes(".") ? name : "index.html"}`);
    if (await file.exists()) {
      const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : ".html";
      return new Response(file, {
        headers: {
          "content-type": TYPES[ext] ?? "application/octet-stream",
          "cache-control": ext === ".html" ? "no-store" : "max-age=3600",
        },
      });
    }
    return new Response(Bun.file(`${WEB}/index.html`), {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  },
});
console.log(`mqtt-board: listening on :${PORT}`);
