/* ==========================================================
   Languway — Service Worker
   - الواجهة: تُخزَّن عند التثبيت وتعمل بدون إنترنت
   - ملفات الموقع: الشبكة أولاً (دون استعمال ذاكرة المتصفح) ثم النسخة المحفوظة عند انقطاع الإنترنت
   - نتائج الترجمة والقاموس: الشبكة أولاً ثم آخر نسخة محفوظة
   - version.json لا يُخزَّن أبداً: الصفحة تقارن به لتعرض رسالة «يوجد تحديث»
   ========================================================== */
const VERSION = 'languway-v11';          // يُغيَّر مع كل إصدار، ويطابق APP_VERSION في script.js
const API_CACHE = 'languway-api';
const SHELL = ['./', 'index.html', 'style.css', 'script.js', 'manifest.json', 'icon.png', 'icon-192.png', 'apple-touch-icon.png', 'logo-mark.png', 'logo-full.png', 'favicon.ico', 'icon-maskable-192.png', 'icon-maskable-512.png'];
const API_HOSTS = ['api.mymemory.translated.net', 'api.dictionaryapi.dev', 'en.wiktionary.org', 'ar.wiktionary.org', 'tatoeba.org'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  // cache: 'reload' يضمن أن النسخة المحفوظة جديدة وليست من ذاكرة المتصفح
  e.waitUntil(caches.open(VERSION)
    .then(c => Promise.all(SHELL.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => { /* ملف اختياري */ }))))
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

// ملفات الموقع: من الشبكة مباشرة (بلا ذاكرة المتصفح)، وعند انقطاع الإنترنت من النسخة المحفوظة
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
  if (req.method !== 'GET') return;              // لا نعترض طلبات POST (مثل الوضع الذكي)
  const url = new URL(req.url);

  if (API_HOSTS.includes(url.hostname)) { e.respondWith(networkFirst(req, API_CACHE)); return; }
  if (FONT_HOSTS.includes(url.hostname)) { e.respondWith(staleWhileRevalidate(req, VERSION)); return; }
  if (url.origin !== location.origin) return;
  if (url.pathname.endsWith('/version.json')) return;     // يذهب للشبكة مباشرة دائماً
  e.respondWith(siteFile(req));
});
