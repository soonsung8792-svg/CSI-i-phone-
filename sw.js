const CACHE = 'testinfo-v11';
const ASSETS = ['./', 'index.html', 'app.js', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/*
 * 네트워크 우선(network-first): 인터넷이 되면 항상 최신 파일을 받아오고,
 * 받아온 걸 캐시에 넣어둔다. 인터넷이 없으면 캐시된 것으로 실행.
 * -> 새 버전을 올리면 앱을 다시 열 때 자동으로 최신이 된다.
 */
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;          // 외부(CDN 등)는 그대로
  if (e.request.method !== 'GET') return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});
