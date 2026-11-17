/* LUMIA shop — works offline with the last products seen, always fetches fresh data when online. */
const CACHE = 'lumia-v16';   // v16: bars hide on every scroll down · v15: roomier product browsing on phones · v14: saving bundles + their category photo · v12: sets from the app · v11: benefit lines, sets, our story · v10: new hero photo · v9: 2026 redesign (hero photo, tab bar) · v6: category & brand pages, filter chips, brand logos, poster banners
const CORE = ['./', 'index.html', 'logo-full.png', 'logo-mark.webp', 'logo-care.webp', 'hero-home-2.webp', 'icon-192.png', 'icon-512.png', 'manifest.webmanifest'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
const cacheFirst = async req => {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') (await caches.open(CACHE)).put(req, res.clone());
  return res;
};
const networkFirst = async req => {
  try {
    const res = await fetch(req);
    if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
    return res;
  } catch (e) {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    throw e;
  }
};
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin !== location.origin) {
    if (/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) e.respondWith(cacheFirst(req));
    return;
  }
  if (u.pathname.includes('/images/') || /\.(png|jpg|jpeg|webp)$/.test(u.pathname)) e.respondWith(cacheFirst(req));
  else e.respondWith(networkFirst(req));
});
