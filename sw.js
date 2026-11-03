// 간호학 단어장 오프라인 지원
// 화면(index.html)은 인터넷이 되면 항상 최신본을 받고, 안 되면 저장본을 씁니다.
// 로그인·동기화 통신(Firebase 서버)은 저장하지 않고 그대로 통과시킵니다.
const CACHE = "kn-voca-v20";
const SHELL = ["./", "index.html", "sync.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "icons/apple-touch-icon.png"];
const CACHE_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com", "www.gstatic.com"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) {
    if (CACHE_HOSTS.indexOf(url.hostname) < 0) return; // Firebase 로그인·데이터 통신은 건드리지 않음
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { if (res.ok) { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); } return res; })));
    return;
  }
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then((res) => { const cp = res.clone(); caches.open(CACHE).then((c) => c.put("index.html", cp)); return res; }).catch(() => caches.match("index.html")));
    return;
  }
  if (url.pathname.endsWith("/sync.js")) {
    e.respondWith(fetch(req).then((res) => { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); return res; }).catch(() => caches.match(req)));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => { const net = fetch(req).then((res) => { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); return res; }).catch(() => hit); return hit || net; }));
});
