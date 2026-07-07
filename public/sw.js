// Minimal service worker: exists so the site is installable as a PWA
// (enabling the share-target capture flow). No offline caching — the
// site is small and captures need the network anyway.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
