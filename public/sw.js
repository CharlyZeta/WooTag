// Service worker mínimo: la app es instalable pero NO funciona sin conexión.
//
// FIX-0028: este archivo no cachea nada a propósito. Cualquier deploy llega en la
// próxima recarga porque (a) el hosting sirve `sw.js` con `no-cache` y (b) el
// registro usa `updateViaCache: 'none'` + `registration.update()`.
// Si en el futuro se agrega precache del shell, hay que versionarlo acá y subir
// el `cacheName` en cada release para no servir versiones viejas.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Toma el control de las pestañas abiertas sin esperar a que se cierren.
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {
  // Handler presente sólo para que el navegador considere la app instalable.
  // Sin `respondWith`: la petición sigue su curso normal hacia la red.
});
