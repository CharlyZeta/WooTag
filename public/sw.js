// Minimal service worker for PWA installability
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  // Empty fetch handler is enough for "Add to Home Screen"
});