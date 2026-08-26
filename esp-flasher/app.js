// ESP Flasher panel — browser gate, character picker, lesson index.
//
// Loaded as a same-origin file, never inline: the CSP names script-src 'self',
// and an inline <script> would be blocked with nothing shown on the page.
(function () {
  'use strict';

  var GALLERY = document.body.dataset.gallery || '';
  var PAGES   = GALLERY.replace(/\/?$/, '/');   // manifests live beside the gallery
  var KRU32   = 'https://github.com/the-oracle-keeps-the-human-human/kru32-oracle';

  // ---- browser gate -------------------------------------------------------
  // Web Serial exists ONLY in a secure context. Home Assistant over
  // http://<host>.local is not one, so Connect is inert there — a failure that
  // reads as "broken board" unless something says otherwise.
  function gate() {
    var el = document.getElementById('gate');
    var badge = document.getElementById('gate-badge');
    var body = document.getElementById('gate-body');
    if (!el) return false;

    var secure = window.isSecureContext === true;
    var serial = 'serial' in navigator;
    var origin = window.location.origin;

    function set(cls, label, html) {
      el.className = 'card ' + cls;
      badge.className = 'badge ' + (cls === 'ok' ? 'ok' : 'bad');
      badge.textContent = label;
      body.innerHTML = html;
    }

    if (secure && serial) {
      set('ok', 'ready', 'Secure context and Web Serial available. Pick a board below.' +
        '<br><span class="muted">origin: ' + origin + '</span>');
      return true;
    }
    if (!secure) {
      set('bad', 'not secure',
        'Served over <strong>' + origin + '</strong>, which is not a secure context, ' +
        'so the browser will not expose Web Serial at all.' +
        '<br><br>Open Home Assistant over <strong>HTTPS</strong> and return to this panel. ' +
        'Nothing is wrong with the board or the add-on.');
      return false;
    }
    set('bad', 'no web serial',
      'Secure context, but this browser has no Web Serial. Chrome or Edge on desktop do; ' +
      'Safari and Firefox do not.');
    return false;
  }

  // ---- character picker ---------------------------------------------------
  function characters(usable) {
    var host = document.getElementById('chars');
    var btn  = document.getElementById('btn');
    var now  = document.getElementById('chosen');
    if (!host) return;

    fetch('characters.json').then(function (r) { return r.json(); }).then(function (list) {
      host.innerHTML = '';
      list.forEach(function (c) {
        var b = document.createElement('button');
        b.className = 'chip';
        b.type = 'button';
        b.innerHTML = '<span class="chip-name"></span><span class="chip-chip"></span>';
        b.querySelector('.chip-name').textContent = c.name;
        b.querySelector('.chip-chip').textContent = c.chips.join(' / ');
        b.addEventListener('click', function () {
          [].forEach.call(host.children, function (x) { x.classList.remove('on'); });
          b.classList.add('on');
          if (btn) btn.setAttribute('manifest', PAGES + c.file);
          if (now) {
            now.innerHTML = 'Selected <strong></strong> — press Connect.';
            now.querySelector('strong').textContent = c.name;
          }
        });
        host.appendChild(b);
      });
      var note = document.getElementById('chars-note');
      if (note) {
        note.textContent = list.length + ' firmwares, each verified reachable on GitHub Pages.' +
          (usable ? '' : ' Selection works, but flashing needs a secure context.');
      }
    }).catch(function () {
      host.innerHTML = '<p class="muted">Could not load characters.json.</p>';
    });
  }

  // ---- kru32 lessons ------------------------------------------------------
  function lessons() {
    var host = document.getElementById('lessons');
    if (!host) return;
    fetch('lessons.json').then(function (r) { return r.json(); }).then(function (list) {
      host.innerHTML = '';
      list.forEach(function (l) {
        var a = document.createElement('a');
        a.className = 'lesson';
        a.href = KRU32 + '/tree/main/lessons/' + l.slug;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = l.slug.replace(/-/g, ' ');
        host.appendChild(a);
      });
    }).catch(function () {
      host.innerHTML = '<p class="muted">Could not load lessons.json.</p>';
    });
  }

  var ok = gate();
  characters(ok);
  lessons();
})();
