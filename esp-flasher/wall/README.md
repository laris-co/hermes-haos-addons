# Twenty air walls

Twenty wall displays for the Kit4Kids PM2.5 monitors in Chiang Mai, built on one tested
engine. Open **[`index.html`](index.html)** — a contact sheet that runs all twenty live,
side by side, so they can actually be compared rather than described.

The audience includes children, during a severe seasonal smoke period. That single fact
sets every constraint below: the answer has to be in words before it is in numbers, a
dead sensor has to look dead, and a unit error has to be impossible rather than unlikely.

They come in two sets:

- **11–20, the designer set.** The ground is *drawn* — poster paint, woodblock, Swiss
  grid, loom, letterpress. Not one raster image between them; every shape is CSS and SVG
  geometry.
- **21–30, the glass set.** The ground is a *photograph of the air*, chosen by the live
  worst reading, with translucent iOS-style panels floating over it. The picture is the
  data: it shows what the air outside currently looks like.

---

## The designer set (11–20)

| # | Name | Designer | Brief |
|---|------|----------|-------|
| 11 | [Playground](v11-playground.html) | after **Bruno Munari** | Each board is a drawn creature in poster paint and ink; the reading is its caption, and a sleeping creature is unmistakably not a clean one. Every shape is CSS and SVG geometry — no images. |
| 12 | [Shout](v12-shout.html) | type as architecture, after **Paula Scher** † | The worst live reading cropped to fill the room, the whole wall flooded in the colour of its EPA band, everything else a footnote pinned to a margin. Readable across a hall before a digit is. |
| 13 | [One Mark](v13-one-mark.html) | after **Saul Bass** | One ground, one accent, one circle. No table, no row, no card, no third hue — every glyph is the band colour at some opacity. The poster inverts for exactly one state: Hazardous. |
| 14 | [Haze](v14-haze.html) | after **Hokusai**, Thirty-six Views | A four-block woodcut of the air on cream paper — sumi, ai, mizu, beni. Every other colour is an overprint multiplied from those four; there is not one gradient in the file. The number is a seal in the corner. |
| 15 | [Ambient](v15-ambient.html) | after **Naoto Fukasawa** | No numerals at rest: colour is the air, and only clean air breathes. Two dark boards are a colourless motionless void, so an offline fleet can never read as clean. Detail fades up when you approach, then recedes. |
| 16 | [Module](v16-module.html) | Swiss grid, after **Josef Müller-Brockmann** † | A twelve-column measurement sheet on one baseline unit, monochrome plus one ink. The red appears *only* from "Unhealthy for Sensitive Groups" upward, so a red mark on this wall always means the same thing. |
| 17 | [Workbench](v17-workbench.html) | after **Charles & Ray Eames** | Every value the boards publish — PM1.0, PM10, RSSI, uptime, air quality level — each with its MQTT topic printed underneath, because the topic is the joint and a joint should be visible. Warmth from rigour, not decoration. |
| 18 | [Subtract](v18-subtract.html) | after **John Maeda**, Laws of Simplicity | One sentence, one number, one screen, no scrollbar. What was removed is listed in the footer *in the page*, because a subtraction you cannot see is indistinguishable from an omission. |
| 19 | [Weave](v19-weave.html) | after **Anni Albers** | The reading is not decorated with colour, it *is* the sett of the cloth: clean air weaves open enough to see the ground through, dirty air packs the threads shut. An offline board shows bare warp — an empty loom is not a zero. |
| 20 | [Journal](v20-journal.html) | after **Edward Tufte** † | A published record rather than a dashboard: paper ground, one text face, hairline rules, numbered figures, real captions, footnotes, a reference line. Nothing averaged, smoothed or filled in; a dash is never a zero. |

† Seven of the ten name their lineage in a comment at the top of the file. Three — Shout,
Module and Journal — describe a *method* instead. Those three attributions are the
chooser's reading of the method, not a claim the files themselves make.

---

## The glass set (21–30)

Ten walls where **the photograph is the reading**. The whole screen is a picture of what
the air outside looks like at the live worst band, cross-faded when a board crosses an EPA
breakpoint, with translucent panels — `backdrop-filter: blur() saturate()`, a low-alpha
fill, a 1px hairline top edge, a soft shadow, a generous radius — floating over it.

| # | Name | Inspiration | Brief |
|---|------|-------------|-------|
| 21 | [Frosted](v21-frosted.html) | **iOS Control Center** ‡ | Modules of dark frosted glass over the sky. The tile tint alpha was *measured* per ground — each JPEG blurred and saturated exactly as CSS will, composited, converted to relative luminance — so white type clears 7:1 wherever a tile lands. Two ink tiers only, because 80% white is the dimmest ink that clears AA on all six. |
| 22 | [Spatial](v22-spatial.html) | **visionOS depth** ‡ | Panels at three depths with pointer/orientation parallax; the photograph takes the smallest offset because it is farthest away. All type is luminous on a guaranteed dark field, never on the bare photo. An unknown fleet gets a void where the sky would be — a clear dawn is a promise this page cannot keep. |
| 23 | [Liquid](v23-liquid.html) | **liquid glass**, fluid morphology ‡ | A slowly morphing blob of fluid glass. Exactly one text polarity — light ink, never dark — so the dark grounds can never swallow it, with a scrim and a veil that grow heavier exactly where the photograph grows brighter. Worst case (a pure-white pixel under the heaviest band) still measures 9.7:1. |
| 24 | [Widgets](v24-widgets.html) | **the iOS home screen** ‡ | A home screen, not a dashboard: 4×4, 2×2, 4×2 and accessory glass tiles on a wallpaper that is the reading. `brightness(.34)` in the backdrop filter darkens *only* the pixels behind a tile, so the exposed wallpaper stays bright enough to read as a photograph while the tile interior collapses into a narrow band. |
| 25 | [Island](v25-island.html) | **the Dynamic Island** ‡ | One black pill at the top carries the entire state, expands on a band change or a touch, then contracts. Nothing else on the screen is UI. The pill is a near-opaque `rgba(8,11,16,.80)`, so the guarantee (12.6:1 on a pure-white ground) does not depend on `backdrop-filter` existing at all. |
| 26 | [Lockscreen](v26-lockscreen.html) | **the iOS Lock Screen** ‡ | Wallpaper, a large light clock, one widget carrying the air, small complications for the rest of the fleet. Four independent legibility layers: a per-band scrim, a radial darkening behind the clock (the only bare text on the page), a dark fill under every glass surface, and a text-shadow halo. |
| 27 | [Weather](v27-weather.html) | **the Apple Weather grammar** ‡ | One sky, one number, one sentence; beneath it a strip of the other monitors, then a single glass card of detail. Text polarity never flips, the scrim is band-tuned (heaviest over the bright dawn, lightest over hazardous so the photo still reads), and the glass fill retunes with it. |
| 28 | [Tiles](v28-tiles.html) | **a Control Center deck** ‡ | A deck of small glass modules over a *fixed* veil whose alpha never drops below 0.68 anywhere on screen, whatever the band — the photograph's colour still reads, its brightness cannot. `backdrop-filter` is treated as a bonus, never the mechanism; the contrast numbers assume it is absent. |
| 29 | [Now Playing](v29-nowplaying.html) | **the iOS music player** ‡ | The band photograph is the album art in a sharp crop; the same frame blown up and heavily blurred is the room colour behind everything. When the air changes band, the record changes. Nothing reads off the sharp photo except one caption under its own .78→.96 gradient scrim. |
| 30 | [Focus](v30-focus.html) | **one pane of glass** ‡ | Every character on the wall lives inside a single dark pane. Contrast is therefore solved once, structurally, rather than re-argued element by element: `brightness(.58)` plus a .50 dark fill, measured at 8.09:1 on pure white and ~19.5:1 on the hazardous frame. |

‡ These name an *interface grammar*, not a person — Control Center, the Lock Screen, the
Dynamic Island, visionOS depth. They are studies in a shared visual language, not homages
to an individual, and none of them claims any affiliation.

### The band → photograph mapping

The background changes with the **live worst reading across the fleet**. Same order as the
EPA bands, one image each:

| Band | PM2.5 (µg/m³) | Image | What it shows |
|---|---|---|---|
| Good | 0 – 12.0 | `img/good.jpg` | clear layered dawn, ridges visible to the far horizon |
| Moderate | 12.1 – 35.4 | `img/moderate.jpg` | a thin veil softening the far layers |
| Unhealthy for Sensitive Groups | 35.5 – 55.4 | `img/sensitive.jpg` | far ridges nearly gone, flat amber light |
| Unhealthy | 55.5 – 150.4 | `img/unhealthy.jpg` | only the nearest ridge, dense ochre-grey air |
| Very Unhealthy | 150.5 – 250.4 | `img/verybad.jpg` | near whiteout, one faint tree line |
| Hazardous | 250.5 and above | `img/hazardous.jpg` | near-total opacity, a small red disc sun |
| *no live board* | — | *(none)* | a neutral dark ground or void, never a photograph |

> **The six JPEGs in `img/` are generated images. They are illustrative, not photographs
> of a specific real place or moment.** They show what each EPA band looks like from a
> valley rim, so a child can see the air before reading a digit. They are not evidence,
> not a record of a particular day, and nothing on any wall presents them as one.

Three mechanics every version in this set shares:

- **Cross-fade, not cut.** Two stacked sky layers; the incoming image fades up over the
  outgoing one. `prefers-reduced-motion: reduce` collapses the transition.
- **Preload the neighbours.** Adjacent bands are decoded ahead of time, so crossing a
  breakpoint is a dissolve and never a white flash. The incoming image is decoded before
  the swap; until then the authored dark ground shows, never white.
- **No live board means no photograph.** An unknown sky renders as a neutral dark ground
  or a void. The clear-dawn frame is only ever shown because a board actually measured
  clean air — an unknown sky must not read as good air.

### How each one guarantees legibility

White text on a bright dawn is unreadable; dark text on the hazardous frame is unreadable.
Every file in this set solves that the same structural way, and states its own arithmetic
in the comment at the top:

1. **One text polarity, always light.** No file flips to dark ink on a bright ground. That
   turns "is the text right for the photo?" into "is the substrate dark enough?" — which
   is something the file controls absolutely.
2. **No glyph on bare photograph.** Text lives inside glass, or on an authored flat ground,
   or (in the one or two places bare type appears) under its own dedicated radial scrim.
3. **The panel fill is the mechanism; the blur is a bonus.** Every contrast figure in these
   files is computed assuming `backdrop-filter` does not exist. The
   `@supports not (backdrop-filter: blur(1px))` block then raises the fill toward opaque,
   which can only darken the substrate and therefore only improve the number — so Firefox
   gets a flatter but entirely readable wall, never unreadable transparent panels.
4. **Band-tuned scrims.** The bright grounds (`good`, `moderate`, `verybad`) get a heavier
   scrim than the dark ones (`unhealthy`, `hazardous`), so the photograph still reads as a
   photograph at the dark end while the type stays safe at the bright end. During a
   cross-fade the *heavier* of the two settings applies, so a dark-ground alpha is never
   used over a bright frame even for one animation frame.
5. **Text-shadow as the last redundancy**, under type that could ever overhang an edge.
6. **Band colour is never load-bearing.** Accents are used for large type, dots and chips
   only; a band *name* is always spelled out in words, never carried by hue alone.

---

## What they all sit on

Every version starts from `../mqtt-dashboard.html` and reuses its MQTT layer, discovery
parsing, availability/expiry handling and EPA banding unchanged. Only the presentation is
replaced. That engine is the tested part; twenty re-implementations of it would have been
twenty chances to get availability wrong.

### Measured facts they are built against

- **Broker**: the Home Assistant host running Mosquitto. **Port 1884 is MQTT-over-WebSocket**
  (an `Upgrade` returns `101` with `Sec-WebSocket-Protocol: mqtt`). A browser *cannot* use
  1883 — that is raw TCP, and pointing a browser at it fails in a way that looks exactly like bad
  credentials. If a wall says it cannot connect, check the port before you check the
  password.
- **Live topics**

  ```
  dbk/DBK-001/status   offline
  dbk/DBK-002/status   online
  dbk/DBK-010/status   offline
  dbk/DBK-002/pm2_5    0
  homeassistant/sensor/dbk_00X_pm25/config
    -> {"name":"PM2.5","unique_id":"dbk_002_pm25",
        "state_topic":"dbk/DBK-00X/pm2_5","unit_of_measurement":"µg/m³", ...}
  ```

  DBK-002 also publishes `dbk/DBK-002/sensor/{pm1_0,pm10,wi-fi_rssi,uptime,air_quality_level}/state`.
- **Normal state is one live board and two offline.** Every version has to render that mixed
  state deliberately. Never a blank card. Never a zero standing in for a dead sensor.

### US EPA PM2.5 breakpoints (µg/m³)

| Band | Range |
|---|---|
| Good | 0 – 12.0 |
| Moderate | 12.1 – 35.4 |
| Unhealthy for Sensitive Groups | 35.5 – 55.4 |
| Unhealthy | 55.5 – 150.4 |
| Very Unhealthy | 150.5 – 250.4 |
| Hazardous | 250.5 and above |

The standard is named on every version, on the sheet, and here. A colour with no named
standard behind it is a mood, not a measurement.

### Shared requirements

- **No configuration UI on load.** Connect immediately from `localStorage` (wrapped in
  try/catch — it throws in private mode), else from `?u=` / `?p=` in the URL, else
  anonymously to the page's own host on port `1884`. Settings live behind pressing **`s`**. A wall display
  is switched on, not filled in.
- **Failure is one calm sentence.** When a wall cannot connect, the whole screen becomes a
  single plain-language instruction, not a stack of red boxes.
- **Answer "should we go outside?" in words**, prominently, not only as a number. A child
  reads the sentence.
- **Self-contained single file.** `mqtt.js` from the same pinned CDN version the source
  uses — `unpkg.com/mqtt@5.15.2` — is the only external dependency. No build step. The six
  JPEGs in `img/`, used by the glass set only, are the sole local assets.
- **No credentials in any file. No absolute-root paths** (`href="/"`, `src="/"`), so
  everything works from `file://` and from a server alike.
- **No nested or horizontal scrollbars.** One document scrollbar at most.

URL hints accepted by every version: `?h=` host, `?port=`, `?u=` user, `?p=` pass,
`?tls=1`, `?f=` topic filter. Each version strips them from the address bar after reading
them, so a passphrase does not sit on a wall-mounted screen. `index.html` forwards any it
was opened with to all twenty and then strips its own.

**If the broker requires a login**, an anonymous connection is refused and every version
falls back to its calm sentence — verified on versions 11–20, which all showed a variant of
*"the broker refused this display … press s and enter the right details"* when opened
without credentials. Twenty identical sentences on the contact sheet is an authentication
result, not a broken sheet. Open it once as `index.html?u=USER&p=PASS`, or use the sign-in
box at the top of the sheet, and every preview inherits the login.

---

## The four bugs that already shipped once

These are not hypotheticals. Each of them reached a real screen, and every version above is
built so it cannot happen again.

### A. CSS uppercasing is a 1000x unit error

`text-transform: uppercase` maps **µ** to **M**. `µg/m³` renders as `MG/M³` — micrograms
become milligrams, a thousand-fold overstatement, caused entirely by a styling rule with no
bug anywhere in the data path.

**Rule: never case-transform text that came off the wire.** Several of these files go
further and contain no `text-transform` declaration at all — the only occurrences of the
word are inside comments explaining why. Every capital you see was typed as a capital.
Small caps, where wanted, are done with `font-variant-caps` on ASCII words authored in the
file.

### B. Viewport units against a container-allocated box

The reading was sized in `vw` while the space it lived in came from a grid column. The two
had no relationship, and `163.3` broke into `163.` on one line and `3` on the next —
failing *precisely* in the hazardous range, the one moment the number matters most.

**Rule: size the reading off the CONTAINER (`cqi` / `cqmin`) or off measured fixed
geometry, never off the viewport — and always `white-space: nowrap`.** Digits do not break.

### C. The discovery name is "PM2.5" on every board

Home Assistant discovery gives all three boards `"name": "PM2.5"`. Using it as the card
title produced three identically-labelled cards and no way to tell which room was on fire.

**Rule: row and card identity comes from the board id parsed out of `state_topic`.** The
discovery name can only ever be a row label *inside* a card, never the card's name.

### D. Never subscribe to a wildcard containing `#`

Subscribing `#` on the fleet broker is roughly **109 GB/day**. Every version filters to the
topics it actually needs, and refuses a `#` subscription outright — a couple of them count
and report the refusals in their diagnostics.

---

## The contact sheet

`index.html` is deliberately the quietest file in the folder: near-monochrome, generous
space, no colour of its own. The only colour on it comes from the twenty previews, which is
the point of a contact sheet. They are grouped under two headings — the designer set
(11–20) and the glass set (21–30) — and every entry carries its number, name,
designer/inspiration, a one-line brief and a link.

- Each entry shows the **real page running**, not a screenshot: a fixed 1280×800 iframe
  reduced with `transform: scale()` inside a fixed-size clipping wrapper. One CSS custom
  property (`--k`) sets the reduction, and the card width is derived from it, so the
  thumbnails stay a uniform grid at every breakpoint.
- **Previews load lazily.** Each iframe carries `loading="lazy"`, so a wall opens its own
  broker connection only once its thumbnail scrolls into view — twenty MQTT connections
  never open at once. Reach the bottom of the page and all twenty exist; open the page and
  walk away and only the first row does. That is stated on the page itself rather than left
  as a surprise.
- Previews are `pointer-events: none` under a full-bleed overlay link, so a click anywhere
  on a thumbnail opens that version full size instead of poking at a miniature wall.
- All links are relative. The sheet works opened straight off disk.

---

## Demo mode — `?demo=`

For most of the year the only live board reads **0 µg/m³** and the other two are dark. That
is the one state these layouts are least likely to break in, and the states that matter —
Moderate, Unhealthy, Hazardous — arrive in the season that gives nobody time to fix a
layout. `163.3` wrapped mid-digit into `163.` and `3` for exactly this reason: nobody had
watched a three-digit reading until one arrived.

So every wall takes a simulated reading from the URL.

| `?demo=` | What it does |
|---|---|
| `good` `moderate` `sensitive` `unhealthy` `verybad` `hazardous` | every board reads a value from the middle of that EPA band |
| *any number* — `163.3`, `250.5`, `0`, `1000` | every board publishes that exact string; the wall truncates it to one decimal the way it truncates a sensor payload, then classifies it |
| `mixed` | the fleet as it usually is: one board live at `163.3`, one asleep with no reading, one whose last word is older than `expire_after` |
| `cycle` | walks all six bands in order, about four seconds each |
| present but unreadable — `?demo=` or `?demo=banana` | falls back to `mixed` **and says so**; it never falls through to live air |

Two properties make it trustworthy rather than a second renderer:

- **The fake readings go through the real code path.** Instead of a broker the wall is handed
  a stub client with no URL and no socket, and the demo publishes through `onMessage()` — the
  same function the broker's bytes land in. Discovery parsing, aliasing, the availability and
  expiry indexes, EPA banding, the headline and the layout are the shipped ones. If the demo
  looks right the wall looks right; if the demo breaks, the wall would have broken too.
- **Band-reactive photographs are driven by it too.** The glass set picks its ground from the
  live worst band, so a demo band cross-fades `img/` exactly as a real reading would.

### The safety rule

This is a **health display**, in a room that includes children, during a burning season.
Fake clean air on a real wall could send a child outside during a hazardous episode; fake
hazardous air alarms a household for nothing. Both are why the following is not negotiable
and not a preference:

1. **Mock data must be impossible to mistake for a reading.** The marker is persistent, not
   a toast: a sticky full-bleed hazard-taped bar that is still on screen at the bottom of a
   long page, legible in a photograph of the screen. It carries the word **DEMO** and
   **ตัวอย่าง**, *and the value being simulated* — "163.3 µg/m³ (Very Unhealthy)", not merely
   "demo mode". Every wall also stamps its own document (`html.demo`, a `data-demo`
   attribute, a `DEMO ·` title prefix) so the tab and a cropped screenshot say it too.
2. **Opt-in from the URL and nowhere else.** No default, no stored flag, no `localStorage`,
   no timer, no "remember this". Drop the parameter and reload and the page is byte-for-byte
   the wall it was before. A control that *sets* demo mode may only do it by writing
   `?demo=` into the address bar — never by holding it in a variable the URL does not show.
3. **A demo page opens no MQTT connection at all.** Not a filtered one, not a read-only one.
   One screen must never be able to carry a real reading and an invented one at the same
   time, so the two can never be on the same page to be confused.
4. **Credentials and the demo flag travel together or not at all.** They are composed into
   one query string by one function, so signing in can never silently drop the flag and put
   live air behind a DEMO banner.

### The band bench on the contact sheet

`index.html` drives all twenty previews at once. Under the masthead there is a row of
buttons — **Live**, the six EPA bands, **Mixed fleet**, **Cycle all six** — plus a box for an
exact value with `163.3` and `250.5` as one-click chips, because those are the two long
strings that break layouts: one wrapped mid-digit once, and the other is the first value
that is Hazardous rather than Very Unhealthy. Beside the selection the sheet prints the EPA
band name and its numeric range, so what is being simulated is named, not inferred.

Choosing a band re-points every preview's `src` *and* every full-size link, so opening a wall
from a demo sheet keeps the same setting. Choosing **Live** removes the parameter everywhere.
The choice is written to the sheet's own address bar and to nothing else — reload without it
and the sheet is live again. The credentials are never written there.

When demo mode is on the sheet grows the same hazard-taped sticky bar, tabs every thumbnail
**DEMO**, and prefixes its tab title.

**It checks rather than assumes.** A sheet that tabbed a thumbnail `DEMO` while that wall was
quietly ignoring the parameter would be mislabelling a real reading, which is the same class
of harm as the reverse. So once per one and a half seconds the sheet reads each preview's
document for the marks a demo wall sets, and reports a count: previews that took the setting,
previews that ignored it — tabbed **LIVE · ?demo= ignored** instead, with the demo ring
removed — and previews it could not check, which are counted as unknown and never as
verified. Opened from `file://` an iframe is a foreign origin and nothing can be read, so
everything is reported unknown and the sheet tells you to look for each wall's own DEMO bar
in its thumbnail.

At the time of writing, versions **11–20 implement `?demo=` and 21–30 do not**. You never
have to trust that sentence: open the sheet with any `?demo=` value and the bench counts them
for you.

---

## Files

```
index.html               the contact sheet — start here

  the designer set — the ground is drawn
v11-playground.html      Munari
v12-shout.html           Scher
v13-one-mark.html        Bass
v14-haze.html            Hokusai
v15-ambient.html         Fukasawa
v16-module.html          Müller-Brockmann
v17-workbench.html       Eames
v18-subtract.html        Maeda
v19-weave.html           Albers
v20-journal.html         Tufte

  the glass set — the ground is a photograph of the air
v21-frosted.html         Control Center
v22-spatial.html         visionOS depth
v23-liquid.html          liquid glass
v24-widgets.html         home screen widgets
v25-island.html          Dynamic Island
v26-lockscreen.html      Lock Screen
v27-weather.html         Apple Weather
v28-tiles.html           Control Center deck
v29-nowplaying.html      Now Playing
v30-focus.html           one pane

img/good.jpg             generated, illustrative — see the note above
img/moderate.jpg
img/sensitive.jpg
img/unhealthy.jpg
img/verybad.jpg
img/hazardous.jpg

../mqtt-dashboard.html   the tested engine all twenty are built on
```
