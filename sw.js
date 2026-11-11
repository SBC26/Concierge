// Minimal service worker: only here so browsers treat the site as an installable
// app (full-screen launch from the home screen). It deliberately caches nothing
// and never answers requests itself, so updates on GitHub Pages arrive exactly
// as before.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
