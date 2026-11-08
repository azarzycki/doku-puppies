/* Doku Puppies service worker: the app shell (code + puzzle data) is cached for offline play. Each deploy ships a new
 * VERSION, so a new worker re-fetches everything on install and the page reloads itself once the worker takes over. */
const VERSION = 'dokupuppies-v1';
const NETWORK_WAIT_MS = 3000; // on a connection that is up but going nowhere, serve the cached copy after this long
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
  // network first for the page itself (a stale install gets fresh HTML as soon as it is online), cache first for everything else
  const networkFirst = sameOrigin && (e.request.mode === 'navigate' || url.pathname.endsWith('index.html'));
  if (networkFirst) {
    const fromCache = () => caches.match(e.request).then(r => r || caches.match('./'));
    const net = fetch(e.request).then(r => { if (r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); } return r; });
    net.catch(() => {}); // a slow reply that lands after we answered from the cache still updates the cache above
    const late = new Promise(resolve => setTimeout(resolve, NETWORK_WAIT_MS, null));
    e.respondWith(Promise.race([net.catch(() => null), late]).then(r => r || fromCache().then(c => c || net)));
  } else {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => { if (r.ok || r.type === 'opaque') { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); } return r; })));
  }
});
