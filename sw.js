/* AZZOUZ AI — service worker: يتنصب فالهاتف ويخدم أوفلاين */
const CACHE = 'azzouz-v3';
const SHELL = ['./azzouz-ai.html', './manifest.json', './icon.svg', './data/memory.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const u = e.request.url;
  if (e.request.method !== 'GET' || !u.startsWith(self.location.origin)) return;
  e.respondWith(
    caches.match(e.request).then(hit => {
      const net = fetch(e.request).then(r => {
        const cp = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, cp)).catch(() => {});
        return r;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
