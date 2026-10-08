// Nudge Chapters service worker: makes the app installable and lets it open offline.
//
// What is cached:
//   - content-hashed build assets (/_next/static/…), fonts and icons: cache-first, kept until the next version;
//   - page shells (HTML with no personal data in it): network-first, cached copy only when offline.
// What is never cached: anything on another origin — Supabase auth and database traffic, so your
// financial data is never written to the cache — and any non-GET request.
//
// Works at the domain root or under a sub-path (e.g. GitHub Pages /nudge-chapters/): every URL is
// resolved against this worker's scope.
const VERSION = "nudge-v2";
const BASE = new URL(self.registration.scope).pathname; // always ends with "/"
const SHELL = [BASE, `${BASE}login/`, `${BASE}manifest.webmanifest`, `${BASE}icon.svg`, `${BASE}icon-192.png`];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const cacheable = (res) => res && res.ok && res.type === "basic";

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;

  if (url.pathname.startsWith(`${BASE}_next/static/`) || /\.(?:woff2?|png|svg|ico|webmanifest)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (cacheable(res)) {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (cacheable(res)) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(url.pathname, copy));
          }
          return res;
        })
        .catch(() =>
          caches.match(url.pathname).then((hit) => hit || caches.match(BASE)).then((hit) => hit || new Response("You're offline. Reconnect and try again.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } })),
        ),
    );
  }
});
