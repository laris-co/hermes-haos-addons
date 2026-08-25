# MQTT Board

Drag live MQTT topics onto a board and arrange them however you like.

- **Catalogue → board.** Whatever arrives on your subscribed patterns shows up
  in the left-hand list; drag one onto the board to make a tile. Drag tiles to
  reorder, × to remove.
- **Shared layout.** Saved on the server (`/data/layout.json`), so it survives
  restarts and every viewer sees the same board.
- **Honest tiles.** Live value, sparkline for numeric feeds, age and message
  count — and a tile goes amber at 90 s and grey at 10 min, so a feed that
  stopped publishing *looks* stopped.
- **No firehose.** It refuses a bare `#` and caps the catalogue at
  `max_topics`, because `#` on a busy broker is gigabytes a day.

```yaml
broker: "mqtt://mqtt.example.com:1883"
topics:
  - "sensors/+/state"
```

Ingress-only — no published port, so Home Assistant's own auth gates it.

See [DOCS.md](DOCS.md) for all options and the ingress/SSE details.
