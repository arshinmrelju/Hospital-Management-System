const CACHE = 'wellness-admin-v1';
const STATIC_ASSETS = [
  '/admin.html',
  '/manifest.json',
  '/css/main.css',
  '/css/layout.css',
  '/css/portals.css',
  '/css/staff-theme.css',
  '/css/patients.css',
  '/css/administration.css',
  '/js/sheets-api.js',
  '/js/firebase-init.js',
  '/js/app.js',
  '/js/admin.js',
  '/assets/hms-logo.jpg',
  '/assets/icon.svg',
  '/offline.html'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      return cache.addAll(STATIC_ASSETS);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE; }).map(function(k) { return caches.delete(k); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function(e) {
  var url = new URL(e.request.url);

  if (e.request.method !== 'GET') return;

  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
    e.respondWith(cacheFirst(e.request));
    return;
  }

  if (url.origin === 'https://cdn.jsdelivr.net') {
    e.respondWith(cacheFirst(e.request));
    return;
  }

  if (url.origin === self.location.origin) {
    if (url.pathname.match(/\.(css|js|json|jpg|jpeg|png|gif|svg|ico|woff2?)$/)) {
      e.respondWith(cacheFirst(e.request));
      return;
    }
    if (url.pathname === '/admin.html' || url.pathname === '/') {
      e.respondWith(networkFirst(e.request));
      return;
    }
  }

  e.respondWith(networkFirst(e.request));
});

function cacheFirst(request) {
  return caches.match(request).then(function(cached) {
    return cached || fetch(request).then(function(response) {
      return caches.open(CACHE).then(function(cache) {
        cache.put(request, response.clone());
        return response;
      });
    });
  });
}

function networkFirst(request) {
  return fetch(request).then(function(response) {
    return caches.open(CACHE).then(function(cache) {
      cache.put(request, response.clone());
      return response;
    });
  }).catch(function() {
    return caches.match(request).then(function(cached) {
      if (cached) return cached;
      if (request.mode === 'navigate') return caches.match('/offline.html');
      return new Response('Offline', { status: 503 });
    });
  });
}
