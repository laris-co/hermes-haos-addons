# ESP Web Flasher

Flash an ESP32 and set its Wi-Fi over USB, from the Home Assistant sidebar,
using [esp-web-tools](https://github.com/esphome/esp-web-tools) and Web Serial.

## The one thing that will confuse you

**Web Serial only exists in a secure context.** Home Assistant reached over
`http://<host>.local` is not one, so the Connect button will do nothing there —
and the failure looks like a broken board rather than a blocked API.

The panel detects this itself and tells you which case you are in. Open Home
Assistant over **HTTPS** and the same panel works.

## Also

A running serial logger holds the port and the browser will not see the device.
Stop it first.

## Options

| option | meaning |
|---|---|
| `gallery_url` | link shown at the bottom of the page |
| `manifest_url` | firmware `manifest.json` to install; leave empty to only configure Wi-Fi on an already-flashed board |
