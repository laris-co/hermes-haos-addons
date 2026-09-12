# maw — Home Assistant OS add-on

A browser UI for [maw](https://github.com/Soul-Brews-Studio/maw-rs), a tmux
orchestrator for fleets of AI coding agents, served through Home Assistant
ingress.

> ⚠️ **~1.04 GB.** Most of that is the three agent CLIs it ships (Claude Code
> alone is ~210 MB) and the Node runtime `omx` needs. The add-on itself is a
> single static binary and a prebuilt web UI.

> **amd64 only.** Upstream publishes no aarch64 Linux binary for maw.

## What it actually is

`maw serve` is a real HTTP + WebSocket server — "APIs, federation, and browser
views" in its own help text. It is not mentioned in maw's README and not in
`maw --help`'s core command list; only `maw help --all` shows it. This add-on
runs it and serves [maw-ui](https://github.com/Soul-Brews-Studio/maw-ui) in
front of it.

What you get is the fleet view: sessions, windows and panes, live over a
WebSocket, plus tabs for Dashboard, Fleet, Terminal, Chat, Teams and Config.

## What it is not

**It is not a way to reach the rest of your fleet.** maw's cross-machine
features — `maw hey`, waking an oracle on another host — need SSH keys and
network access that this add-on does not configure. Out of the box you are
looking at one container.

**It is not a login for your agents.** Claude Code, Codex and omx are
installed, not authenticated. Each still needs its own credentials before it
will do anything.

## Access and security

The gate is Home Assistant's own ingress session — the same trust boundary
every other ingress-only add-on here uses. There is no second password, and
there are no options to configure.

Behind that, two things are handled for you:

- **maw serve's bearer token** is generated on first boot, persisted to
  `/data`, and injected by nginx. It never reaches the browser. Without it
  maw serve rejects browser clients with 403.
- **maw serve's Origin allowlist** is satisfied by nginx rewriting `Origin`
  to one fixed value. The real origin depends on how you reach Home Assistant
  (mDNS name, bare IP, Tailscale, NetBird), so it cannot be enumerated ahead
  of time — normalizing it keeps the check meaningful instead of switching it
  off.

An HTTP Basic gate was tried and removed: inside HA's ingress iframe it
produces a native browser credential prompt, and browsers increasingly refuse
those in cross-origin iframes.

**Understand what you are exposing.** Anyone who can open this panel gets a
terminal into the container and can drive agents that run commands. Treat
access to it the way you treat SSH.

## Sessions

A tmux session named `maw` is created at boot and kept alive by a watchdog.
Typing `exit` in the terminal view is a normal thing to do and used to leave
the add-on with no sessions and no way to make one; now the session comes back
within a few seconds.

The **+ session** button at the bottom-left creates a named session. It is
injected by this add-on, not part of maw-ui — maw serve has no endpoint for
creating sessions (`/api/sessions` is read-only, `/api/wake` needs a real
oracle repo), so both the button and its endpoint are supplied here. Names are
restricted to `A-Z a-z 0-9 _ -`, at most 32 characters; `.` and `:` are
rejected because tmux reads them as window and pane separators.

## Bundled CLIs

| CLI | Version | Source |
|-----|---------|--------|
| `maw` | v26.9.12-alpha.1834 | GitHub release, checksum verified |
| `claude` | 2.1.269 | `downloads.claude.ai`, checksum from the release manifest |
| `codex` | 0.154.0 | GitHub release, checksum pinned in the Dockerfile |
| `omx` | 0.21.5 | npm (`oh-my-codex`) |

Every version is pinned. Nothing resolves "latest" at build time, and no
installer is piped into a shell.

## Install

Add this repository to the Add-on Store, install **maw**, start it, and open
it from the sidebar. See [DOCS.md](DOCS.md) for how the pieces fit together
and what was measured to make ingress work.
