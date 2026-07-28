/* ================================================================
   SERVICE WORKER — Wellness Medicals HMS
   v6-offline-first
   ================================================================
   Strategy:
   - Static assets (HTML/JS/CSS/fonts/images): Cache-first
   - Google Fonts / CDN: Cache-first
   - API calls (script.google.com JSONP): Network-only (no caching)
   - Navigation requests: Network-first, fall back to cached version
   - All app shell pages are pre-cached on install
   ================================================================ */

const CACHE = 'wellness-v7-offline';

const STATIC_ASSETS = [
  /* ─── App Shell Pages ─── */
  '/',
  '/index.html',
  '/patients.html',
  '/admin.html',
  '/report.html',
  '/offline.html',
  '/manifest.json',

  /* ─── Core CSS ─── */
  '/css/main.css',
  '/css/layout.css',
  '/css/portals.css',
  '/css/staff-theme.css',
  '/css/patients.css',
  '/css/administration.css',

  /* ─── Core JS ─── */
  '/js/app.js',
  '/js/firebase-init.js',
  '/js/sheets-api.js',
  '/js/reception-dashboard.js',
  '/js/patients.js',
  '/js/skin.js',
  '/js/ortho.js',
  '/js/pwa.js',
  '/js/offline-db.js',
  '/js/offline-sync.js',

  /* ─── Assets ─── */
  '/assets/hms-logo.jpg'
];

/* ─── Install: pre-cache everything ─── */
self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (cache) {
      // addAll fails atomically — if one resource 404s we skip it gracefully
      return Promise.allSettled(
        STATIC_ASSETS.map(function (url) {
          return cache.add(url).catch(function (err) {
            console.warn('[SW] Failed to cache:', url, err.message);
          });
        })
      );
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

/* ─── Activate: purge old caches ─── */
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (k) { return k !== CACHE; })
          .map(function (k) { return caches.delete(k); })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

/* ─── Fetch strategy ─── */
self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);

  // Only handle GET requests
  if (e.request.method !== 'GET') return;

  // ── Skip: Google Apps Script API calls (JSONP) ──
  // These must always be network-only; we never cache API responses
  if (url.hostname === 'script.google.com') return;
  if (url.hostname === 'firestore.googleapis.com') return;
  if (url.hostname === 'firebasestorage.googleapis.com') return;

  // ── Google Fonts & CDN: Cache-first ──
  if (
    url.origin === 'https://fonts.googleapis.com' ||
    url.origin === 'https://fonts.gstatic.com' ||
    url.origin === 'https://cdn.jsdelivr.net'
  ) {
    e.respondWith(cacheFirst(e.request));
    return;
  }

  // ── Same-origin static assets: Cache-first ──
  if (url.origin === self.location.origin) {
    if (url.pathname.match(/\.(css|js|json|jpg|jpeg|png|gif|svg|ico|woff2?)$/)) {
      e.respondWith(cacheFirst(e.request));
      return;
    }

    // ── HTML pages: Network-first, cache fallback ──
    if (
      url.pathname === '/' ||
      url.pathname.endsWith('.html')
    ) {
      e.respondWith(networkFirst(e.request));
      return;
    }
  }

  // ── Everything else: Network-first ──
  e.respondWith(networkFirst(e.request));
});

/* ─── Cache-first: serve cache, update cache in background ─── */
function cacheFirst(request) {
  return caches.match(request).then(function (cached) {
    if (cached) {
      // Revalidate in background (stale-while-revalidate)
      fetch(request).then(function (response) {
        if (response && response.ok) {
          caches.open(CACHE).then(function (cache) { cache.put(request, response); });
        }
      }).catch(function () {});
      return cached;
    }
    return fetch(request).then(function (response) {
      if (response && response.ok) {
        caches.open(CACHE).then(function (cache) { cache.put(request, response.clone()); });
      }
      return response;
    }).catch(function () {
      return caches.match('/offline.html');
    });
  });
}

/* ─── Network-first: try network, fall back to cache ─── */
function networkFirst(request) {
  return fetch(request).then(function (response) {
    if (response && response.ok) {
      caches.open(CACHE).then(function (cache) { cache.put(request, response.clone()); });
    }
    return response;
  }).catch(function () {
    return caches.match(request).then(function (cached) {
      if (cached) return cached;
      // For navigation, show the offline page
      if (request.mode === 'navigate') return caches.match('/offline.html');
      return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
    });
  });
}

/* ─── Message channel: respond to ping from clients ─── */
self.addEventListener('message', function (e) {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (e.data && e.data.type === 'GET_CACHE_VERSION') {
    e.source.postMessage({ type: 'CACHE_VERSION', version: CACHE });
  }
});
