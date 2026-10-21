// 离线缓存（PWA）：第一次打开后，没网也能查曲目
//   - 网页本身和三个游戏的数据：先用缓存显示，同时在后台下载新版本，下次打开就是新的
//   - 曲绘：看过的存起来（最多 COVER_MAX 张），没网时也能显示
// 改了缓存的文件列表或策略时，把 VERSION 加 1，旧缓存会被清掉
const VERSION = 'v1';
const SHELL = `shell-${VERSION}`;
const COVERS = 'covers';
const COVER_MAX = 800;
const FILES = [
  './',
  'index.html',
  'src/app.js',
  'src/calc.js',
  'data/maimai.js',
  'data/chunithm.js',
  'data/ongeki.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/apple-touch-icon.png',
  'icons/favicon.png',
];
const COVER_HOSTS = ['dp4p6x0xfi5o9.cloudfront.net', 'assets2.lxns.net'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('shell-') && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    // 页面跳转（#/maimai/song/… 都是同一个页面）一律用 index.html
    const key = req.mode === 'navigate' ? 'index.html' : req;
    e.respondWith(staleWhileRevalidate(key, req));
  } else if (COVER_HOSTS.includes(url.hostname)) {
    e.respondWith(coverFirst(req));
  }
});

// 先给缓存里的，同时去网上取新的放进缓存；缓存里没有就等网络
async function staleWhileRevalidate(key, req) {
  const cache = await caches.open(SHELL);
  const hit = await cache.match(key, { ignoreSearch: true });
  const fresh = fetch(req.mode === 'navigate' ? 'index.html' : req)
    .then((res) => {
      if (res.ok) cache.put(key, res.clone());
      return res;
    })
    .catch(() => null);
  if (hit) return hit;
  return (await fresh) || new Response('离线，且没有缓存', { status: 503 });
}

// 曲绘：有缓存直接用，没有再下载并存起来
async function coverFirst(req) {
  const cache = await caches.open(COVERS);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok && res.type !== 'opaque') {
      await cache.put(req, res.clone());
      trim(cache);
    }
    return res;
  } catch {
    return new Response('', { status: 504 });
  }
}

async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - COVER_MAX; i++) await cache.delete(keys[i]);
}
