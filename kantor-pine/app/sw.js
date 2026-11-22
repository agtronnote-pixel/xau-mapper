// Service worker: simpan "cangkang" aplikasi agar bisa dibuka offline.
const CACHE = 'kpx-v2.2.0';
const SHELL = ['./', 'index.html', 'app.js', 'engine.js', 'data.js', 'exporters.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('kpx-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;               // API harga: selalu jaringan
  if (url.pathname.includes('/data/')) return;               // data server (mapping, berita): selalu jaringan
  // jaringan dulu (agar update cepat terpasang), cache sebagai cadangan offline
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request).then(m => m || caches.match('index.html'))));
});
self.addEventListener('notificationclick', e => { e.notification.close(); e.waitUntil(self.clients.matchAll({ type: 'window' }).then(ws => ws.length ? ws[0].focus() : self.clients.openWindow('./'))); });
