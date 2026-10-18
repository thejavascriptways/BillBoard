self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const fresh = event.request.url.includes("/api/") ? { cache: "no-store" } : undefined;
  event.respondWith(fetch(event.request, fresh));
});
