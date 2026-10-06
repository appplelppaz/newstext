// オフライン用の Service Worker。アプリのファイルを端末にキャッシュし、電波がなくても開けるようにする
// ファイルを足したら PRECACHE に入れ、VERSION を上げる（tools/check-offline.js で確認できる）
const VERSION = 'level1-v4';
const FONTS = 'level1-fonts';
const PRECACHE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'assets/app.js',
  'assets/icon-180.png',
  'assets/icon-512.png',
  'assets/icon.svg',
  'assets/ink.js',
  'assets/listen.js',
  'assets/plan.js',
  'assets/study.js',
  'assets/style.css',
  'data/books.js',
  'data/checkpoints.js',
  'data/guide.js',
  'data/idioms-a.js',
  'data/idioms-b.js',
  'data/idioms-c.js',
  'data/papers-index.js',
  'data/translation-a.js',
  'data/translation-b.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== FONTS).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 字体（Google Fonts）：一度読んだら端末に残し、以後はそれを使う
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONTS).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    }));
    return;
  }
  if (url.origin !== self.location.origin) return;

  // アプリのファイル：キャッシュをすぐ返し、裏でネットから取り直す（次に開いたときに新しくなる）
  e.respondWith(caches.open(VERSION).then(async (c) => {
    const key = req.mode === 'navigate' ? 'index.html' : req;
    const hit = await c.match(key, { ignoreSearch: true });
    const net = fetch(req).then((res) => {
      if (res.ok && res.type === 'basic') c.put(key, res.clone());
      return res;
    }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    return (await net) || (await c.match('index.html')) || Response.error();
  }));
});
