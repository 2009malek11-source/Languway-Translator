/* ==========================================================
   Languway — Service Worker
   - الواجهة: تُخزَّن عند التثبيت وتعمل بدون إنترنت
   - ملفات الموقع: تُحدَّث في الخلفية (stale-while-revalidate)
   - نتائج الترجمة والقاموس: الشبكة أولاً ثم آخر نسخة محفوظة
   ========================================================== */
const VERSION = 'languway-v5';
const API_CACHE = 'languway-api';
const SHELL = ['./', 'index.html', 'style.css', 'script.js', 'manifest.json', 'icon.png', 'icon-192.png', 'apple-touch-icon.png', 'logo-mark.png', 'logo-full.png', 'favicon.ico', 'icon-maskable-192.png', 'icon-maskable-512.png'];
const API_HOSTS = ['api.mymemory.translated.net', 'api.dictionaryapi.dev', 'en.wiktionary.org', 'ar.wiktionary.org', 'tatoeba.org'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== API_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// نسخة قديمة فوراً ثم تحديث في الخلفية
async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const fresh = fetch(req).then(res => { if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res; }).catch(() => cached);
  return cached || fresh;
}

// الشبكة أولاً، وعند الفشل نستخدم المحفوظ
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

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;              // لا نعترض طلبات POST (مثل الوضع الذكي)
  const url = new URL(req.url);

  if (API_HOSTS.includes(url.hostname)) { e.respondWith(networkFirst(req, API_CACHE)); return; }
  if (FONT_HOSTS.includes(url.hostname)) { e.respondWith(staleWhileRevalidate(req, VERSION)); return; }
  if (url.origin !== location.origin) return;

  // ملفات الموقع: الشبكة أولاً (يظهر كل تحديث فوراً) ثم النسخة المحفوظة عند انقطاع الإنترنت
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(res => { const c = res.clone(); caches.open(VERSION).then(ca => ca.put('index.html', c)); return res; })
      .catch(() => caches.match('index.html')));
    return;
  }
  e.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then(res => { if (res && res.ok) { const c = res.clone(); caches.open(VERSION).then(ca => ca.put(req, c)); } return res; })
      .catch(() => caches.match(req))
  );
});
