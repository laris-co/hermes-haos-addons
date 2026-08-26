# MQTT Open Read

Lets a dashboard subscribe to this broker without a password, by writing an
`allow_anonymous` stanza into `/share/mosquitto/` — which `core_mosquitto` folds
into its own configuration when `customize.active` is true.

**Read-only by default, deliberately.** "Remove the password" almost always means
"stop making my wall display ask for one". It rarely means "let anything on the
network publish". On a display that tells children whether the air is safe to
breathe, a writable topic is a display that can be made to lie — so anonymous
publish is a separate, opt-in switch.

Authenticated users are untouched. The ACL's anonymous rules sit before any
`user` stanza, so Home Assistant, ESPHome devices and the bridge keep working
exactly as before. Adding this cannot lock you out.

## Undo

Delete `/share/mosquitto/anonymous-read.conf` and restart the Mosquitto broker.

## Options

| option | meaning |
|---|---|
| `read_topics` | topic patterns anonymous clients may subscribe to. A bare `#` is refused in code — an unscoped subscription against the fleet broker once measured ~109 GB/day. |
| `allow_anonymous_publish` | default `false`. Turning it on lets any device write these topics. |
