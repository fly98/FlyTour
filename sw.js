// Service worker minimo: serve solo a rendere l'app installabile come PWA
// (Chrome su Android mostra "Installa app" — e quindi apre a schermo intero —
// solo se il sito espone un service worker con un gestore fetch).
// Volutamente NON mette nulla in cache: ogni richiesta va sempre in rete,
// così non si rischia mai di vedere una versione vecchia dell'app.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // pass-through: nessuna cache, nessuna interferenza
  return;
});
