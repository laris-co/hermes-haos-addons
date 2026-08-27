# MQTT Hub panel

Sidebar view of `mqtt-hub` — a dedicated EMQX broker VM reachable over the NetBird
mesh (`mqtt-hub.oracle.netbird`), separate from catlab's own `core_mosquitto`.

Proxies EMQX's real dashboard (`:18083`) through Home Assistant's ingress, the same
pattern `esp-flasher` uses for the wall displays. `host_network: true` is required —
the mesh interface is a host-level NetBird device; without it, this container's
isolated bridge network has no route to it and every request times out silently.

Log in with the credentials in `pass show mqtt-hub/emqx-admin-password` (not the
EMQX default — that was rotated immediately after first install, see the tracking
issue in `kvm-oracle`).
