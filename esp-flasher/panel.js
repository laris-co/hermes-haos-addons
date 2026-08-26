// Keep the proxied workshop site inside the Home Assistant ingress panel.
//
// Injected into every proxied HTML page by nginx sub_filter. Served from this
// add-on, so it is same-origin and satisfies script-src 'self'.
//
// sub_filter already strips static target="_blank" attributes, but that only
// covers what is in the HTML at proxy time. This handles the rest:
//   · links added by the page's own JavaScript after load
//   · window.open() calls
//   · <base target="_blank"> and form targets
// and it gives the panel a Back control, which an iframe otherwise has no
// chrome for.
(function () {
  'use strict';

  // ---- 1. stay in the panel by default, but honour explicit intent --------
  //
  // A plain click should never leave the panel. A DELIBERATE new-tab gesture
  // still should: ⌘-click (mac), Ctrl-click (win/linux), middle-click, and
  // Shift-click are how people say "I want this somewhere else", and silently
  // swallowing them is worse than the escaping we are fixing.
  function wantsNewTab(e) {
    return e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1;
  }

  // Capture phase, so this runs before the page's own click handlers.
  document.addEventListener('click', function (e) {
    if (wantsNewTab(e)) return;                 // let the browser do its thing
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;

    var href = a.getAttribute('href') || '';
    // in-page anchors and non-navigating schemes must be left alone
    if (!href || href.charAt(0) === '#' || /^(javascript|mailto|tel|data|blob):/i.test(href)) return;

    var t = (a.getAttribute('target') || '').toLowerCase();
    if (t === '_blank' || t === '_new' || t === '_top' || t === '_parent') {
      e.preventDefault();
      e.stopPropagation();
      window.location.href = a.href;
    }
  }, true);

  // Middle-click fires auxclick, not click. Let it through untouched — it is
  // one of the deliberate gestures above.
  document.addEventListener('auxclick', function (e) {
    if (e.button === 1) e.stopPropagation();
  }, true);

  // window.open -> same-document navigation. Returns a minimal stub rather than
  // null: some libraries do `var w = window.open(...); w.focus()` and a null
  // would throw where the original merely popped a blocked-popup warning.
  var nativeOpen = window.open;
  window.open = function (url) {
    if (url) {
      try { window.location.href = String(url); } catch (_) { return nativeOpen.apply(window, arguments); }
    }
    return { closed: false, focus: function () {}, close: function () {}, document: document };
  };

  // A <base target="_blank"> would retarget every link on the page at once.
  var base = document.querySelector('base[target]');
  if (base) base.removeAttribute('target');

  // Forms can break out too.
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (f && f.getAttribute && /_blank|_top|_parent/i.test(f.getAttribute('target') || '')) {
      f.setAttribute('target', '_self');
    }
  }, true);

  // ---- 2. Back control ----------------------------------------------------
  // An ingress panel is an iframe with no browser chrome of its own, so once you
  // follow a link there is no way back without leaving Home Assistant.
  function addBack() {
    if (document.getElementById('ha-panel-back')) return;

    var b = document.createElement('button');
    b.id = 'ha-panel-back';
    b.type = 'button';
    b.textContent = '← Back';
    b.setAttribute('aria-label', 'Go back');
    b.style.cssText = [
      'position:fixed', 'left:14px', 'bottom:14px', 'z-index:2147483647',
      'font:600 13px/1 system-ui,-apple-system,sans-serif',
      'padding:9px 14px', 'border-radius:7px', 'cursor:pointer',
      'color:#0f171e', 'background:#e8c25a',      // matches the workshop's gold
      'border:1px solid rgba(0,0,0,.35)',
      'box-shadow:0 3px 12px rgba(0,0,0,.45)',
      'opacity:.92', 'transition:opacity .12s',
    ].join(';');
    b.addEventListener('mouseenter', function () { b.style.opacity = '1'; });
    b.addEventListener('mouseleave', function () { b.style.opacity = '.92'; });

    b.addEventListener('click', function () {
      // history.length > 1 means we navigated within the panel; otherwise this
      // IS the landing page and the only sensible "back" is the panel root.
      if (window.history.length > 1) window.history.back();
      else window.location.href = './';
    });

    document.body.appendChild(b);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addBack);
  } else {
    addBack();
  }
})();
