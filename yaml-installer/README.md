# YAML Installer

Pulls ESPHome device configs from a **git repository** into `/config/esphome` on a Home
Assistant OS guest. The de-facto code lives in git (e.g. `dustboy-kit/esp32c3-pm25-monitor`,
MIT); this installs it — pin a ref, **preview** what would change, then apply with per-file
backups.

## How it works

The add-on declares `map: [config:rw]`, so it can write `/config` directly — no dashboard API,
no HA Terminal, no `python3 -m http.server` relay, no human in the browser. `git clone --depth 1`
a pinned ref into a temp dir, classify every `.yaml`, and copy on demand.

## Options

| Option | Default | Notes |
|---|---|---|
| `repo` | `dustboy-kit/esp32c3-pm25-monitor` | any public `https://` git repo |
| `ref` | `main` | branch or tag — pin it for reproducible classroom builds |
| `subdir` | `""` | pull only a subtree, e.g. `packages` |
| `target` | `esphome` | **allowlisted**: `esphome`, `esphome/packages`, `www` |
| `mode` | `safe` | `safe` skips existing files · `overwrite` backs them up first |

Change options → **Restart** (options apply at container start), then open the panel.

## The safety rules, each a trap this fleet hit

- **`target` is an allowlist, enforced in code** and re-checked after path resolution — an
  add-on that can write anywhere in `/config` could break Home Assistant itself. `../` is refused.
- **`secrets.yaml` is refused by name.** A repo's `secrets.yaml.example` is fine; the real one
  never comes from git.
- **`.git/` and `.github/` are skipped.** A repo's `.github/workflows/*.yaml` are CI files, not
  device configs, and must never land in `/config/esphome`.
- **AppleDouble `._*` files are skipped.** macOS `tar` metadata once reached an ESPHome build and
  produced `stray '\345'` on compile.
- **Top-level `.yaml` is flagged `⚠ device`.** The ESPHome Builder lists every top-level `.yaml`
  as a device, so a base/package file dropped in the root shows as a phantom offline card. The
  preview warns before you write.
- **Nothing is Deleted.** `overwrite` copies the existing file to `<name>.bak-<timestamp>` before
  replacing it.

## Verify

`safe`/`overwrite`, the allowlist, the backup, and the exclusions were all tested against the
real `dustboy-kit/esp32c3-pm25-monitor` repo before release: 8 device files landed in
`packages/`, `.github` excluded, an existing `dbk.yaml` skipped in safe mode and backed up in
overwrite mode, `../` refused.

## Licence

See the repository `LICENSE`. Installs third-party configs under their own licences — the
DustBoy Kit upstream is MIT.
