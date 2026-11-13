// Lets the app open without a connection.
//
// Every file is fetched from the network first (so an update shows up the next
// time the app is opened) and a copy is kept; offline, the kept copy is used.

const CACHE = 'macros-v5';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/main.js', 'js/config.js',
  'js/core/schema.js', 'js/core/store.js', 'js/core/calc.js', 'js/core/merge.js', 'js/core/dates.js', 'js/core/format.js', 'js/core/nutrients.js', 'js/core/weight.js',
  'js/sync/google.js', 'js/sync/engine.js',
  'js/ui/dom.js', 'js/ui/components.js', 'js/ui/charts.js', 'js/ui/theme.js',
  'js/ui/views/day.js', 'js/ui/views/calendar.js', 'js/ui/views/foods.js', 'js/ui/views/foodEditor.js', 'js/ui/views/settings.js',
  'icons/icon.svg', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Only this app's own files; Google's addresses always go straight to the network.
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    // By address, not by `request`: a page-load request can't be re-sent with
    // options, which would throw and leave the app stuck on its old copy.
    fetch(request.url, { cache: 'no-cache', credentials: 'same-origin' })
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true }).then((hit) => hit || caches.match('./'))));
});
