/* AssetPulse service worker: offline shell + OS notifications */
const CACHE = 'assetpulse-v2';
const ASSETS = ['./', './index.html', './styles.css', './app.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  e.respondWith(
    caches.match(req).then(hit => {
      const network = fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => hit || caches.match('./index.html'));
      return hit || network;   // stale-while-revalidate
    })
  );
});

/* Server-sent push (VAPID) */
self.addEventListener('push', e => {
  let data = { title: 'AssetPulse', body: 'You have a new notification.', url: './#/app/notifications' };
  try { if (e.data) data = Object.assign(data, e.data.json()); } catch (_) {
    if (e.data) data.body = e.data.text();
  }
  e.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: './icons/icon-192.png',
    badge: './icons/favicon-32.png',
    tag: data.tag || 'assetpulse',
    data: { url: data.url || './#/app/notifications' },
    vibrate: [90, 40, 90]
  }));
});

/* Notification tapped: focus or open the app */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || './#/app/notifications';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) { if ('focus' in c) { c.navigate(target); return c.focus(); } }
      return self.clients.openWindow(target);
    })
  );
});

/* Client-triggered device notification */
self.addEventListener('message', e => {
  const d = e.data || {};
  if (d.type === 'notify') {
    self.registration.showNotification(d.title || 'AssetPulse', {
      body: d.body || '',
      icon: './icons/icon-192.png',
      badge: './icons/favicon-32.png',
      tag: d.tag || 'assetpulse',
      data: { url: d.url || './#/app/notifications' },
      vibrate: [90, 40, 90]
    });
  }
});
