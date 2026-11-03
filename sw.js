/* Doku Puppies service worker: app shell cached for offline play; data files refreshed when online. */
const VERSION = 'dokupuppies-v1';
const SHELL = ['./', 'index.html', 'css/style.css', 'js/app.js', 'js/game.js', 'js/engine.js', 'js/puzzles.js', 'js/pups.js', 'js/sound.js', 'js/store.js', 'js/gen-worker.js', 'js/terrain.js',
  'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'data/levels.json', 'data/bank.json', 'data/daily.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const sameOrigin = url.origin === location.origin;
  const isFirebase = url.hostname === 'www.gstatic.com';
  if (!sameOrigin && !isFirebase) return;
  // network first for the page + data (so updates land), cache first for everything else
  const networkFirst = sameOrigin && (e.request.mode === 'navigate' || url.pathname.endsWith('.json') || url.pathname.endsWith('index.html'));
  if (networkFirst) {
    e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./'))));
  } else {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => { if (r.ok || r.type === 'opaque') { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); } return r; })));
  }
});
