// Cache only the public application shell. API responses, uploads and password-reset
// URLs always use the network and never enter an offline cache.
const CACHE = 'hrms-public-shell-v1';
const CORE = [
  '/',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(CORE);
      const html = await (await cache.match('/')).text();
      const entries = [
        ...new Set([...html.matchAll(/(?:src|href)="(\/assets\/[^"?]+)"/g)].map((m) => m[1])),
      ];
      await cache.addAll(entries);
      const pages = new Set();
      for (const entry of entries.filter((file) => file.endsWith('.js'))) {
        const code = await (await cache.match(entry)).text();
        for (const match of code.matchAll(/assets\/[\w.-]+\.(?:js|css)/g))
          pages.add(`/${match[0]}`);
      }
      await cache.addAll([...pages].filter((file) => !entries.includes(file)));
      await self.skipWaiting();
    })(),
  );
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith('hrms-public-shell-') && key !== CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/uploads') ||
    url.pathname === '/reset-password'
  )
    return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => (await caches.open(CACHE)).match('/')));
    return;
  }
  if (
    !url.pathname.startsWith('/assets/') &&
    !CORE.includes(url.pathname) &&
    !url.pathname.startsWith('/icons/')
  )
    return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(request);
      if (hit) return hit;
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') {
        await cache.put(request, response.clone());
        const keys = await cache.keys();
        const assets = keys.filter((key) => new URL(key.url).pathname.startsWith('/assets/'));
        for (const key of assets.slice(0, Math.max(0, assets.length - 100)))
          await cache.delete(key);
      }
      return response;
    })(),
  );
});
