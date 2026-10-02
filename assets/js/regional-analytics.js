(() => {
  'use strict';
  const scriptURL = document.currentScript?.src;
  const panels = [...document.querySelectorAll('[data-regional-controls]')];
  if (!scriptURL || panels.length === 0) return;

  const preferenceKey = 'flick-dry-regional-consent';
  let consent = false;
  let persistent = true;
  let pagePreference = null;
  let endpoint = null;
  let attempted = false;
  let failed = false;
  try { consent = localStorage.getItem(preferenceKey) === 'granted'; }
  catch { persistent = false; }

  function privacySignal() {
    return navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' || window.doNotTrack === '1';
  }

  function render() {
    let message;
    if (privacySignal()) message = 'Regional statistics are off: your browser privacy signal is respected.';
    else if (!endpoint) message = 'Regional statistics are not enabled yet or are temporarily unavailable. No regional count is sent.';
    else if (!consent && pagePreference === false) message = 'Regional statistics are off for this page only; your browser could not save the preference. To block future pages too, enable Do Not Track or Global Privacy Control.';
    else if (!consent) message = 'Regional statistics are off. You can optionally allow them below.';
    else if (!persistent) message = 'Regional statistics are allowed for this page only; your browser could not save the preference.';
    else message = 'Regional statistics are allowed. Your consent preference is saved on this device.';
    if (failed && consent && endpoint && !privacySignal()) message += ' The counter is currently unavailable; this page will not retry.';
    for (const panel of panels) {
      panel.hidden = false;
      panel.querySelector('[data-regional-status]').textContent = message;
      panel.querySelector('[data-regional-allow]').disabled = !endpoint || privacySignal() || consent;
      panel.querySelector('[data-regional-deny]').disabled = false;
      panel.querySelector('[data-regional-deny]').textContent = consent ? 'Turn regional statistics off' : 'Keep regional statistics off';
    }
  }

  function setPreference(granted) {
    consent = granted;
    pagePreference = null;
    try { localStorage.setItem(preferenceKey, granted ? 'granted' : 'denied'); persistent = true; }
    catch { persistent = false; pagePreference = granted; }
    render();
    countOnce();
  }

  function countOnce() {
    if (!endpoint || privacySignal() || attempted) return;
    // A queued storage event/configuration response may lag behind a newer opt-out.
    // Re-read the actual preference immediately before sending, except explicit page-only consent.
    if (pagePreference === null) {
      try { consent = localStorage.getItem(preferenceKey) === 'granted'; }
      catch { consent = false; persistent = false; }
      render();
    }
    else consent = pagePreference;
    if (!consent) return;
    attempted = true;
    // No page URL, referrer, visitor ID or request payload. Never retry uncertain counts.
    fetch(endpoint, {
      method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer',
      cache: 'no-store', keepalive: true
    }).then(response => {
      if (!response.ok) { failed = true; render(); }
    }).catch(() => { failed = true; render(); });
  }

  function checkedEndpoint(config) {
    if (config?.enabled !== true || typeof config.endpoint !== 'string' || !config.endpoint) return null;
    try {
      const url = new URL(config.endpoint);
      const allowedHost = url.hostname === 'analytics.flick-dryinitiative.org' ||
        /^flick-dry-regional\.[a-z0-9-]+\.workers\.dev$/.test(url.hostname);
      if (url.protocol !== 'https:' || !allowedHost || url.port || url.username || url.password ||
          url.pathname !== '/collect' || url.search || url.hash) return null;
      return url.href;
    } catch { return null; }
  }

  for (const panel of panels) {
    panel.querySelector('[data-regional-allow]').addEventListener('click', () => {
      if (endpoint && !privacySignal()) setPreference(true);
    });
    panel.querySelector('[data-regional-deny]').addEventListener('click', () => setPreference(false));
  }
  window.addEventListener('storage', event => {
    if (event.key !== preferenceKey && event.key !== null) return;
    // A failed-to-save explicit opt-out stays authoritative for this page.
    if (pagePreference === false) consent = false;
    else {
      pagePreference = null;
      try { consent = localStorage.getItem(preferenceKey) === 'granted'; }
      catch { consent = false; persistent = false; }
    }
    render();
    countOnce();
  });
  render();
  fetch(new URL('regional-config.json', scriptURL).href, {
    credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store'
  }).then(response => response.ok ? response.json() : null).then(config => {
    endpoint = checkedEndpoint(config);
    render();
    countOnce();
  }).catch(() => { endpoint = null; render(); });
})();
