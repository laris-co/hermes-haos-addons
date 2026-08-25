# Paperclip [EXPERIMENTAL] — details

## What this wraps

`FROM ghcr.io/paperclipai/paperclip@sha256:23090eb60885f130d460562c401e7b65789e42400c71708ecfcb6be5d6cfa936`
— resolved from the `:latest` tag on 2026-08-24 (this session's `gh`
token lacked package-read scope to enumerate other published tags
directly; the digest itself is the real, immutable pin, same guarantee
this repo's other `FROM image@sha256:...` lines give — see repo README
for the general convention).

```
$ docker manifest inspect ghcr.io/paperclipai/paperclip:latest
  "architecture": "amd64", "os": "linux"
  "architecture": "arm64", "os": "linux"
```

Real, published multi-arch manifest. amd64 additionally confirmed by
actually running it under emulation on this repo's native arm64 build
machine.

```
$ docker images ghcr.io/paperclipai/paperclip:latest --format "{{.Size}}"
5.62GB
$ docker images local/paperclip:1.0.0 --format "{{.Size}}"
6.59GB
```

This add-on's own layer adds ~970 MB on top of upstream's 5.62 GB —
almost entirely the same GTK3/WebKit2GTK/GStreamer runtime libraries
this repo's standalone `thclaws/DOCS.md` documents in full (thclaws'
one official Linux binary hard-links this stack in every mode,
regardless of upstream's own claim that CLI/serve mode doesn't need
it — verified there via `readelf -d`, not repeated here).

## The adapter: why vendored, and the real contract mismatch it hit

`@soul-brews-studio/thclaws-paperclip-adapter` is not published
anywhere publicly reachable:

```
$ npm view @soul-brews-studio/thclaws-paperclip-adapter
npm error 404 Not Found
```

Its own `package.json` has no `publishConfig`, and its source repo is
private. Vendored the actual source instead (`gh api
repos/Soul-Brews-Studio/thclaws-paperclip-adapter/contents/...`, MIT
licensed, copyright/permission notice preserved in
`adapter/LICENSE-vendored-adapter`) — see `adapter/NOTICE.md` for the
full provenance statement. Its one real dependency,
`@paperclipai/adapter-utils`, genuinely is public on npm and is
installed normally, not vendored.

**A real compatibility gap, found by testing, not assumed away**:
Paperclip's external-adapter loader
(`server/src/adapters/plugin-loader.ts`, function
`validateAdapterModule`) requires a package's resolved entry point to
export a **named `createServerAdapter()` factory function**:

```ts
const createServerAdapter = m.createServerAdapter;
if (typeof createServerAdapter !== "function") {
  throw new Error(`Package "${packageName}" does not export createServerAdapter()...`);
}
const adapterModule = createServerAdapter() as ServerAdapterModule;
```

The vendored adapter's own `src/index.ts` (unmodified) exports a plain
object instead:

```ts
export const thclawsLocalAdapter: ServerAdapterModule = { type: "thclaws_local", ... };
export default thclawsLocalAdapter;
```

No `createServerAdapter` export at all — loading this package as-is
through Paperclip's real loader would throw. Fixed with one small file
this repo adds on top (`adapter/src/paperclip-entry.ts`, NOT part of
the vendored source):

```ts
import { thclawsLocalAdapter } from "./index.js";
export function createServerAdapter() { return thclawsLocalAdapter; }
```

...and pointing this add-on's own `package.json` `exports["."]` at the
compiled output of that file instead of `dist/index.js`. Verified this
actually satisfies the real loader — a real Node process, not a
description of the contract:

```
$ node --input-type=module -e '
import("./dist/paperclip-entry.js").then(async (m) => {
  console.log("createServerAdapter type:", typeof m.createServerAdapter);
  const mod = m.createServerAdapter();
  console.log("adapter type field:", mod.type);
})'
createServerAdapter type: function
adapter type field: thclaws_local
```

## Live proof against the real Paperclip server (not a simulation)

Built the adapter, mounted it into a real, running
`ghcr.io/paperclipai/paperclip:latest` container via the mechanism
`server/src/services/adapter-plugin-store.ts` documents (a JSON record
at `$PAPERCLIP_HOME/adapter-plugins.json` naming a `localPath`), and
watched the server's own boot log:

```
$ docker run -d -p 13100:3100 -e HOST=0.0.0.0 -e PAPERCLIP_HOME=/paperclip \
    -e BETTER_AUTH_SECRET=... -e PAPERCLIP_TOOL_ACTION_SIGNING_SECRET=... \
    -v .../paperclip-test:/paperclip ghcr.io/paperclipai/paperclip:latest

INFO: Loading external adapter package {"packageName":"@soul-brews-studio/thclaws-paperclip-adapter", ...}
INFO: Loaded external adapters from plugin store {"count":1,"adapters":["thclaws_local"]}
```

This is a real load into a real server, confirmed again inside this
add-on's own final built image (not just the standalone test rig):

```
$ docker run -d -p 13200:3100 -v .../data:/data local/paperclip:1.0.0
[paperclip] exec: docker-entrypoint.sh node --import ./server/node_modules/tsx/dist/loader.mjs server/dist/index.js
INFO: Loading external adapter package {"packageDir":"/opt/thclaws-adapter", "entryPoint":"./dist/paperclip-entry.js", ...}
INFO: Loaded external adapters from plugin store {"count":1,"adapters":["thclaws_local"]}
```

Note this is Paperclip's own generic "adapters" system
(`packages/adapters/*` + this runtime `plugin-loader.ts` +
`adapter-plugin-store.ts`), a **different, separate mechanism** from
the general instance-wide "plugins" system (`paperclipai plugin
install`, out-of-process workers, `POST /api/plugins/install`) this
investigation looked at first before finding the right one. Worth
naming explicitly since Paperclip's own docs use "plugin" for both.

## `PAPERCLIP_DEPLOYMENT_MODE=authenticated` — verified live, not just a Dockerfile default

Upstream's own production Dockerfile sets
`ENV PAPERCLIP_DEPLOYMENT_MODE=authenticated PAPERCLIP_DEPLOYMENT_EXPOSURE=private`,
but an `ENV` default can be silently overridden by later config-file
logic — checked directly rather than trusted:

```
$ curl -s http://127.0.0.1:13200/api/health
{"status":"ok","deploymentMode":"authenticated","deploymentExposure":"private",
 "commit":"213dabab4f8e1f3bb1803a2924c0fea1289fcd4c","bootstrapStatus":"bootstrap_pending", ...}
```

Also visible in the real startup banner:

```
Deploy          authenticated (private)
Bind            lan (0.0.0.0)
Auth            ready
```

Holds live, unmodified by this add-on. `bootstrapStatus:
bootstrap_pending` means the real onboarding/admin-claim flow still
needs to run in the browser before the instance is usable — not driven
end to end in this investigation (see "Not verified" below).

## Ingress — investigated and rejected, with live evidence

The standing rule in this repo is "web UI → sidebar," so this was
checked properly, not skipped. Same test shape as this repo's Open
WebUI (`PUBLIC_BASE_PATH`) and litellm (`SERVER_ROOT_PATH`)
investigations:

```
$ docker run -d -p 13101:3100 ... -e PAPERCLIP_PUBLIC_URL=http://127.0.0.1:13101/api/hassio_ingress/faketoken123 \
    ghcr.io/paperclipai/paperclip:latest

$ curl -s http://127.0.0.1:13101/ | grep -o '(src|href)="[^"]*"'
href="/apple-touch-icon.png"
href="/assets/index-BqfqfoQX.css"
src="/assets/index-CnBrDwGT.js"
```

Byte-identical to a run with `PAPERCLIP_PUBLIC_URL` unset —
`PAPERCLIP_PUBLIC_URL` affects Better Auth's callback-URL construction
only, not served asset paths, confirmed by direct comparison.

```
$ curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:13101/api/hassio_ingress/faketoken123/
404
```

Requesting the ingress-shaped path directly (i.e. simulating what would
happen if Supervisor did NOT strip the prefix) also fails — Paperclip
doesn't route under any prefix at all. No subpath support exists here
in any form. Conclusion: real published port, same call as Open WebUI
and litellm.

## Shutdown behavior — verified, `init: false` is correct

```
$ docker run -d ghcr.io/paperclipai/paperclip:latest   # bare upstream, no wrapping
$ time docker stop -t 10 <container>
docker stop -t 10 <container>  0.01s user 0.01s system 1% cpu 0.901 total
$ docker inspect <container> --format 'ExitCode={{.State.ExitCode}}'
ExitCode=0
```

Fast, clean stop with zero involvement from this add-on's wrapping.
Re-confirmed against this add-on's own final built image:

```
$ docker stop -t 10 <container>
docker stop -t 10 <container>  0.01s user 0.01s system 1% cpu 0.726 total
$ docker inspect <container> --format 'ExitCode={{.State.ExitCode}}'
ExitCode=0
```

Contrast `thclaws/config.yaml`, which needs `init: true` for the
opposite reason (a bare Rust binary as literal PID 1 silently ignores
SIGTERM) — Paperclip's own Node process handles it correctly on its
own, and this add-on's `docker-entrypoint.sh`/`gosu` chain doesn't
interfere. Same config key, opposite correct value — worth a
cross-reference so nobody "harmonizes" the two later.

## A real bug this build caught: CMD silently reset to null

First build of this Dockerfile set a new `ENTRYPOINT` in the final
stage without restating `CMD`. Result:

```
$ docker inspect local/paperclip:1.0.0 --format '{{json .Config.Cmd}}'
null
$ docker run -d ... local/paperclip:1.0.0
$ docker logs <container>
[paperclip] exec: docker-entrypoint.sh
Usage: gosu user-spec command [args]
```

`run.sh`'s `"$@"` was empty — Docker does not inherit a base image's
`CMD` once the current build stage declares its own `ENTRYPOINT`
without also declaring `CMD` (this is documented Docker behavior, not
specific to multi-stage builds, but easy to miss). Fixed by restating
the base image's real `CMD` verbatim
(`["node", "--import", "./server/node_modules/tsx/dist/loader.mjs", "server/dist/index.js"]`)
in this add-on's own `Dockerfile`. Re-verified afterward:

```
$ docker inspect local/paperclip:1.0.0 --format '{{json .Config.Cmd}}'
["node","--import","./server/node_modules/tsx/dist/loader.mjs","server/dist/index.js"]
$ docker logs <container>
[paperclip] exec: docker-entrypoint.sh node --import ./server/node_modules/tsx/dist/loader.mjs server/dist/index.js
INFO: Loaded external adapters from plugin store {"count":1,"adapters":["thclaws_local"]}
```

## Secret auto-generation and persistence — verified across a real restart

```
$ SECRET1=$(cat data/.better_auth_secret)
$ docker restart <container>
$ SECRET2=$(cat data/.better_auth_secret)
$ [ "$SECRET1" = "$SECRET2" ] && echo STABLE
STABLE
```

Confirms the auto-generated `BETTER_AUTH_SECRET` and
`PAPERCLIP_TOOL_ACTION_SIGNING_SECRET` survive a restart rather than
silently rotating (which would have looked like random session/auth
breakage on every add-on restart) — same reasoning and same pattern as
`hermes-agent-lite`'s `session_secret` auto-gen.

## `extra_env` — malformed entry handling

```
$ echo '{"extra_env":["SOME_VAR=hello","BAD ENTRY"]}' > data/options.json
$ docker run -d -v data:/data local/paperclip:1.0.0
$ docker logs <container>
[paperclip] WARNING: ignoring malformed extra_env entry: BAD ENTRY
[paperclip] exec: docker-entrypoint.sh node --import ...
```

Malformed entry logged and skipped, well-formed entry exported, boot
continues — same pattern as every other add-on in this repo.

## `thclaws` binary — sanity-checked inside this specific image

```
$ docker run --rm --entrypoint sh local/paperclip:1.0.0 -c "thclaws --version"
thclaws 0.115.0
revision: af3b80f (HEAD)
built:    2026-08-19T17:29:01Z (release)
```

Same pinned v0.115.0 release this repo's standalone `thclaws` add-on
uses, fetched and checksum-verified the same way (see
`thclaws/Dockerfile`) — confirmed it actually runs inside *this*
image's specific combination of installed GTK/WebKit/GStreamer
packages, not assumed from the standalone add-on's separate build.

## Not verified

- The full onboarding/bootstrap flow (creating the first admin account
  in the browser) was not driven end to end — confirmed
  `bootstrapStatus: bootstrap_pending` via `/api/health`, not that
  completing it works.
- No agent was actually created with the `thclaws_local` adapter type
  and run through Paperclip's task system — confirmed the adapter
  *loads* and is *selectable* (it appears in
  `{"adapters":["thclaws_local"]}`), not that a full task execution
  through it succeeds end to end against a real OpenAI-compatible
  gateway.
- No real provider credentials or a real `litellm`/`9router` instance
  were wired up as the adapter's `baseUrl` target.
- No live HAOS Supervisor install — plain `docker build`/`docker run`
  only, per this repo's standard caveat, and per team-lead's own offer
  to verify the plugin-registration mechanism on a real Supervisor
  (catlab) if it couldn't be confirmed here — it has now been confirmed
  here, against the real upstream image, so that offer may not be
  needed, but a live-Supervisor pass would still be the strongest
  remaining check.
- Image size measured on this repo's native arm64 build machine only —
  not independently re-measured on native amd64.
