// Minimal service worker: satisfies PWA installability criteria.
// No offline caching is attempted — every request just passes through to the network.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Form posts, including the password-reset Server Action, must go straight
  // to the network. Re-issuing a request body from the worker is unnecessary
  // for this pass-through script and can make a submit look like a dead click.
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request));
});
