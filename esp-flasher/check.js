// Secure-context / Web Serial gate.
//
// Web Serial is exposed ONLY in a secure context (HTTPS or localhost). Home
// Assistant reached over plain http://<host>.local is NOT one, so the flasher's
// Connect button is inert there — and esp-web-tools reports that in a way that
// is easy to read as "the board is broken". This says plainly which of the two
// it is, and how to fix it.
(function () {
  var gate  = document.getElementById('gate');
  var badge = document.getElementById('gate-badge');
  var body  = document.getElementById('gate-body');
  if (!gate || !badge || !body) return;

  var secure    = window.isSecureContext === true;
  var hasSerial = 'serial' in navigator;
  var origin    = window.location.origin;

  function set(cls, text, html) {
    gate.className = 'card ' + cls;
    badge.className = 'badge ' + (cls === 'ok' ? 'ok' : 'bad');
    badge.textContent = text;
    body.innerHTML = html;
  }

  if (secure && hasSerial) {
    set('ok', 'ready',
      'Secure context and Web Serial are both available. Connect below.' +
      '<br><span class="muted">origin: ' + origin + '</span>');
    return;
  }

  if (!secure) {
    set('bad', 'not secure',
      'This page is served over <strong>' + origin + '</strong>, which is not a ' +
      'secure context, so the browser will not expose Web Serial at all.' +
      '<br><br>Open Home Assistant over <strong>HTTPS</strong> instead ' +
      '(for example your external URL) and come back to this panel. ' +
      'Nothing is wrong with the board or the add-on.' +
      '<br><br><span class="muted">Alternative that needs no HTTPS: ' +
      'https://web.esphome.io in Chrome or Edge on the machine holding the board.</span>');
    return;
  }

  set('bad', 'no web serial',
    'This is a secure context, but the browser does not implement Web Serial. ' +
    'Chrome or Edge on desktop do; Safari and Firefox do not.' +
    '<br><span class="muted">origin: ' + origin + '</span>');
})();
