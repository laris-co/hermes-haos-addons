# MQTT Bridge Writer

Writes a scoped `mosquitto` bridge config into `/share/mosquitto/` from this add-on's own
options, so `core_mosquitto` (with `customize.active: true`) can bridge named topics in from an
external broker — no SSH, no manual file edit.

## Why an add-on for one file

`core_mosquitto`'s bridge support is a raw `mosquitto.conf` overlay dropped into
`/share/mosquitto/`. There is no options-field for it. This add-on uses `map: [share:rw]` to
write that file directly — credentials stay in Supervisor options, never in git, never typed
into a Terminal add-on.

## The one rule enforced in code

**No bare `#` topic — checked in `server.py`, not just documented.** A bare subscription on
this fleet's broker measured ~**109 GB/day**. `render()` refuses to write if any topic is `#`
or starts with `#`, and exits nonzero rather than writing a partial file.

## Enable the bridge

1. Configure this add-on's options (host, user, password, topics) and start it.
2. On `core_mosquitto`: set `options.customize = {"active": true, "folder": "mosquitto"}`.
3. Restart `core_mosquitto`.
4. Check its logs for `Connecting bridge <name>`.

Re-rendered fresh from options on every start — nothing is ever edited in place, so there is
nothing to drift.

## Licence

See the repository `LICENSE`.
