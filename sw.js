
const VERSION = 'lw-k7q4m2x9';
const API_CACHE = 'languway-api';
const SHELL = ['./', 'index.html', 'style.css', 'script.js', 'lexicon.js', 'fonts/brand.woff', 'manifest.json', 'icon.png', 'icon-192.png', 'apple-touch-icon.png', 'logo-mark.png', 'logo-full.png', 'logo-english.png', 'logo-spanish.png', 'logo-french.png', 'favicon.ico', 'icon-maskable-192.png', 'icon-maskable-512.png'];
const API_HOSTS = ['api.mymemory.translated.net', 'api.dictionaryapi.dev', 'en.wiktionary.org', 'ar.wiktionary.org', 'tatoeba.org'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION)
    .then(c => Promise.all(SHELL.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {  }))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== API_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const fresh = fetch(req).then(res => { if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res; }).catch(() => cached);
  return cached || fresh;
}
async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const cached = await cache.match(req);
    if (cached) return cached;
    return new Response('{}', { status: 503, headers: { 'Content-Type': 'application/json' } });
  }
}
async function siteFile(req) {
  try {
    const res = await fetch(req, { cache: 'no-cache' });
    if (res && res.ok) { const c = res.clone(); caches.open(VERSION).then(ca => ca.put(req, c)); }
    return res;
  } catch {
    return (await caches.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? caches.match('index.html') : Response.error());
  }
}
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (API_HOSTS.includes(url.hostname)) { e.respondWith(networkFirst(req, API_CACHE)); return; }
  if (url.origin !== location.origin) return;
  if (url.pathname.endsWith('/version.json')) return;
  e.respondWith(siteFile(req));
});
