# MQTT Board

Drag live MQTT topics onto a board and arrange them however you like.

## Setup

1. Set `broker` (and `username`/`password` if the broker needs them).
2. List the topic patterns to subscribe to. `+` wildcards are fine:
   ```yaml
   broker: "mqtt://mqtt.example.com:1883"
   topics:
     - "sensors/+/state"
     - "DUSTBOY/DBK/+/sensor/+/state"
   ```
3. Start it, open **MQTT Board** in the sidebar, and drag topics from the left
   catalogue onto the board.

Tiles can be reordered by dragging, removed with ×, and the layout is saved
**on the server** (`/data/layout.json`) — so it survives restarts and every
viewer sees the same board, rather than each browser keeping its own copy.

## Why it refuses `#`

A bare `#` subscribes to everything. On a busy fleet broker that is gigabytes a
day of traffic into a container that only wants a handful of values — so the
add-on exits with an explanatory error instead of quietly melting. List real
patterns. `max_topics` (default 500) is a second stop: once the catalogue is
full, new topics are counted and reported in the UI rather than accumulated.

## What a tile shows

- The live value — big and numeric when the payload parses as a number
  (bare `23.4` or a JSON number), monospace text otherwise.
- A sparkline of recent numeric history (last 120 points, in memory).
- Age and message count.
- **Staleness**: amber after 90 s, greyed out after 10 min. A feed that stopped
  publishing looks stopped — the most common failure is silence, and a board
  that keeps showing the last value as if it were live hides exactly that.

## Notes

- **Ingress-only**, no published port, so Home Assistant's auth gates access.
- Transport is **SSE**, not WebSocket — no upgrade negotiation to be broken by
  the ingress proxy — pushing a full snapshot every 2 s.
- All frontend URLs are relative and the server matches routes with
  `endsWith()`, because Supervisor prefixes requests with
  `/api/hassio_ingress/<session-token>/`, which is not knowable at build time.
- History is in memory only; restarting the add-on clears the sparklines. The
  layout is what persists.
- Payloads are truncated at 512 bytes for display.
