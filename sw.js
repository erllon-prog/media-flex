// Cache só dos arquivos do app e do núcleo comum; dados e leitura de foto sempre vão para a rede.
const CACHE = "media-flex-v4";
const SHELL = [
  "./", "index.html", "app.css?v=4", "app.js?v=4", "manifest.webmanifest",
  "icon-192.png", "icon-512.png", "apple-touch-icon.png",
  "../comum/nucleo.css?v=1", "../comum/nucleo.js?v=1", "../comum/config.js?v=1",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const isShell = url.origin === self.location.origin || url.hostname === "cdn.jsdelivr.net";
  if (!isShell || url.pathname.endsWith("versoes.json")) return;
  // rede primeiro (pega atualizações), cache como reserva offline
  e.respondWith(
    fetch(req).then((r) => {
      if (r.ok && !url.search.includes("code=")) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return r;
    }).catch(() => caches.match(req).then((r) => r || caches.match("index.html")))
  );
});
