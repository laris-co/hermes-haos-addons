/**
 * Fills each wall's own connection storage from a same-origin credential this
 * add-on rendered at container start (render_creds.py, from its own
 * Supervisor-managed options — never from this file, never from git).
 *
 * This file is injected into every /wall/*.html response by nginx (see
 * ingress.conf's sub_filter on the /wall/ location) rather than being added to
 * each of the twenty wall files individually, so a new wall added later gets
 * it automatically and there is exactly one place to read to know what this
 * mechanism does.
 *
 * It NEVER overwrites a key that already holds something — a value someone
 * typed in through a wall's own settings panel always wins. It only fills a
 * wall that would otherwise be asking.
 *
 * host/port/tls are also optional overrides from the same options (blank by
 * default = each wall's normal LAN behavior: this page's own hostname, port
 * 1884, plain ws://). Set them to point every wall at a broker reachable from
 * outside the LAN instead — e.g. a Cloudflare Tunnel published straight to
 * the broker.
 */
(function () {
  var KEYS = [
    'air-wall.conn.v1', 'air-playground.conn.v1', 'air-shout.conn.v1',
    'one-mark.conn.v1', 'haze-wall.conn.v1', 'air-workbench.conn.v1',
    'air-weave.conn.v1', 'air-widgets.conn.v1', 'air-tiles.conn.v1',
    'air-focus.conn.v1'
  ];
  var RELOADED_FLAG = 'wallcreds.reloaded.v1';

  function hasStorage() {
    try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); return true; }
    catch (e) { return false; }
  }
  function already(key) {
    try { var v = localStorage.getItem(key); return !!(v && JSON.parse(v)); }
    catch (e) { return false; }
  }
  function fill(key, cfg) {
    try { localStorage.setItem(key, JSON.stringify(cfg)); return true; }
    catch (e) { return false; }
  }
  function reloadedAlready() {
    try { return sessionStorage.getItem(RELOADED_FLAG) === '1'; } catch (e) { return true; }
  }
  function markReloaded() {
    try { sessionStorage.setItem(RELOADED_FLAG, '1'); } catch (e) {}
  }

  if (!hasStorage()) return; // private-mode / storage disabled: nothing this script can do

  fetch('_creds.json', { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (creds) {
      if (!creds || !creds.user) return; // no option configured on this install — normal, silent

      var cfg = {
        host: creds.host || location.hostname || '',
        port: creds.port || '1884',
        user: creds.user, pass: creds.pass || '',
        tls: !!creds.tls, filter: '', remember: true
      };

      var filledAny = false;
      KEYS.forEach(function (k) {
        if (!already(k) && fill(k, cfg)) filledAny = true;
      });

      // A wall's boot() runs before this fetch resolves, so a page that had
      // nothing stored already showed its "not authorised" / settings prompt
      // this load. Reload once so the freshly-filled storage is picked up on
      // the very next paint, instead of making the viewer refresh by hand.
      if (filledAny && !reloadedAlready()) {
        markReloaded();
        location.reload();
      }
    })
    .catch(function () {}); // no _creds.json, or blocked — every wall's own flow still works
})();
