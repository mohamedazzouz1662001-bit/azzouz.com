/* AZZOUZ service worker — الصفحات دايما من الشبكة، الملفات الثابتة من الكاش */
const CACHE = 'azzouz-v4';
const SHELL = ['./azzouz-ai.html', './manifest.json', './icon.svg'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {})));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => { if (e.data === 'skip') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // APIs خارجية: بلا كاش

  const isDoc = req.mode === 'navigate' || /\.html?$/i.test(url.pathname) || url.pathname.endsWith('/');

  if (isDoc) {
    // شبكة أولاً: باش التحديثات توصل دغيا
    e.respondWith(
      fetch(req, { cache: 'no-store' })
        .then(res => { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)).catch(() => {}); return res; })
        .catch(() => caches.match(req).then(hit => hit || caches.match('./azzouz-ai.html')))
    );
    return;
  }

  // ملفات ثابتة (.mjs, css, صور): الكاش أولاً ثم الشبكة
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      const cp = res.clone();
      caches.open(CACHE).then(c => c.put(req, cp)).catch(() => {});
      return res;
    }).catch(() => hit))
  );
});
