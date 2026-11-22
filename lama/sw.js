// Caches the app shell so XAU Mapper opens offline and loads instantly.
// API calls (Twelve Data, Claude) always go to the network and are never cached.
// Bump VERSION whenever app files change so installed copies update.
const VERSION = 'xau-mapper-v2';   // dipindah ke /lama/; hanya menghapus cache miliknya sendiri
const SHELL = [
  './', 'index.html', 'app.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png',
  'agents/xau-macro.md', 'agents/xau-technical.md', 'agents/xau-liquidity.md',
  'agents/xau-quant.md', 'agents/xau-risk.md', 'agents/xau-chief-strategist.md',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('xau-mapper-') && k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (new URL(e.request.url).origin !== location.origin) return; // APIs: straight to network
  // Network first so updates show up; fall back to cache when offline.
  e.respondWith(fetch(e.request)
    .then(r => {
      if (r.ok && e.request.method === 'GET') { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
      return r;
    })
    .catch(() => caches.match(e.request)));
});
