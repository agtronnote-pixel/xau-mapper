// Service worker pengganti untuk alamat root.
// Versi lama (XAU Mapper) di sini menghapus semua cache di domain ini, termasuk cache
// offline Kantor Pine. File ini menggantikannya: hanya membersihkan cache XAU Mapper lama
// di root, lalu melepaskan diri. Aplikasi lama sekarang ada di /lama/, Kantor Pine di /kantor-pine/app/.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k === 'xau-mapper-v1').map(k => caches.delete(k))))
    .then(() => self.registration.unregister())
    .then(() => self.clients.matchAll({ type: 'window' }))
    .then(ws => ws.forEach(w => w.navigate(w.url))));
});
