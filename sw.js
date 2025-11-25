const CACHE_NAME = 'viltrum-fitness-v6.3.18';
const RUNTIME_CACHE = 'viltrum-runtime-v6.3.18';

const urlsToCache = [
  './',
  './index.html',
  
  // Pages
  './pages/dashboard.html',
  './pages/workout.html',
  './pages/nutrition.html',
  './pages/workout-completion.html',
  './pages/profile.html',
  
  // JavaScript - Core
  './js/config.js',
  './js/state.js',
  './js/auth.js',
  './js/access-control.js',
  './js/workout.js',
  './js/session-cache.js',
  './js/offline-preloader.js',
  './js/preload-modal.js',
  './js/ajax-navigation.js',
  './viewport.js',
  
  // JavaScript - Features
  './js/workout-history.js',
  './js/profile-manager.js',
  './js/welcome-modal.js',
  './js/enhanced-settings.js',
  './js/updated-training-data.js',
  './js/nutrition-app.js',
  './js/nutrition-engine.js',
  './js/training-selector.js',
  
  // CSS
  './css/main.css',
  './css/access-control.css',
  './css/nutrition.css',
  './css/features.css',
  './css/welcome-modal.css',
  
  // Data
  './food-database.json',
  './manifest.json',
  
  // Icons
  './icons/icon-72x72.png',
  './icons/icon-96x96.png',
  './icons/icon-128x128.png',
  './icons/icon-144x144.png',
  './icons/icon-152x152.png',
  './icons/icon-192x192.png',
  './icons/icon-384x384.png',
  './icons/icon-512x512.png',
  
  // External resources (for offline)
  'https://fonts.googleapis.com/css2?family=Staatliches&display=swap',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing v6.3.18 (weights sync)...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching app shell v6.3.18');
        // Cache files one by one to handle failures gracefully
        return Promise.allSettled(
          urlsToCache.map(url => 
            cache.add(url).catch(err => {
              console.warn(`[Service Worker] Failed to cache ${url}:`, err);
              return null;
            })
          )
        );
      })
      .then(() => {
        console.log('[Service Worker] Install complete - forcing activation');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[Service Worker] Cache failed:', error);
      })
  );
});

// Listen for SKIP_WAITING message from update notifier
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[Service Worker] Received SKIP_WAITING message');
    self.skipWaiting();
  }
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating v6.3.18...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[Service Worker] Activated - taking control');
      return self.clients.claim();
    })
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Check if this is an auth-related request (has tokens or auth params)
  const isAuthRequest = url.searchParams.has('access_token') || 
                        url.searchParams.has('refresh_token') || 
                        url.searchParams.has('type') ||
                        url.searchParams.has('token_hash') ||
                        url.searchParams.has('code') ||
                        url.searchParams.has('error') ||
                        url.searchParams.has('error_description');

  // Handle navigation requests (HTML pages)
  if (request.mode === 'navigate' || request.destination === 'document') {
    
    // AUTH REQUESTS: Network-first (needed for email confirmation, password reset, etc.)
    if (isAuthRequest) {
      console.log('[Service Worker] Auth navigation - network first:', request.url);
      event.respondWith(
        fetch(request, { redirect: 'manual' })
          .then(response => {
            if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
              console.log('[Service Worker] Auth redirect, browser handles');
              return response;
            }
            return response;
          })
          .catch(error => {
            console.log('[Service Worker] Auth fetch failed:', error);
            return caches.match(request).then(cached => cached || caches.match('./index.html'));
          })
      );
      return;
    }
    
    // INTERNAL NAVIGATION: Cache-first for INSTANT loading (no loading bar!)
    // This serves cached pages immediately, then updates cache in background
    console.log('[Service Worker] Internal navigation - cache first:', request.url);
    event.respondWith(
      caches.match(request).then(cachedResponse => {
        if (cachedResponse) {
          console.log('[Service Worker] ⚡ Instant page from cache:', request.url);
          // Update cache in background (stale-while-revalidate)
          fetch(request).then(networkResponse => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(RUNTIME_CACHE).then(cache => {
                cache.put(request, networkResponse);
              });
            }
          }).catch(() => {});
          return cachedResponse;
        }
        
        // Not in cache - fetch from network and cache it
        console.log('[Service Worker] Page not cached, fetching:', request.url);
        return fetch(request).then(response => {
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(RUNTIME_CACHE).then(cache => {
              cache.put(request, responseToCache);
            });
          }
          return response;
        }).catch(error => {
          console.log('[Service Worker] Navigation fetch failed:', error);
          return caches.match('./index.html');
        });
      })
    );
    return;
  }

  // Skip auth-related non-navigation requests
  if (isAuthRequest) {
    console.log('[Service Worker] Skipping cache for auth request');
    return;
  }

  // Handle external domains - cache CDN resources aggressively
  if (url.origin !== self.location.origin) {
    if (url.origin.includes('cdn.jsdelivr.net') ||
        url.origin.includes('fonts.googleapis.com') ||
        url.origin.includes('fonts.gstatic.com')) {
      event.respondWith(
        caches.match(request).then(cachedResponse => {
          if (cachedResponse) {
            console.log('[Service Worker] Serving CDN from cache:', request.url);
            return cachedResponse;
          }
          return fetch(request).then(response => {
            if (response && response.status === 200) {
              return caches.open(RUNTIME_CACHE).then(cache => {
                cache.put(request, response.clone());
                return response;
              });
            }
            return response;
          }).catch(() => {
            console.log('[Service Worker] CDN offline, no cache available');
            return new Response('Offline', { status: 503 });
          });
        })
      );
    }
    return;
  }

  // Cache-first strategy for app resources (CSS, JS, images, etc.)
  event.respondWith(
    caches.match(request)
      .then((response) => {
        if (response) {
          console.log('[Service Worker] Serving from cache:', request.url);
          // Return cached response but update cache in background
          fetch(request)
            .then(networkResponse => {
              if (networkResponse && networkResponse.status === 200) {
                caches.open(RUNTIME_CACHE).then(cache => {
                  cache.put(request, networkResponse);
                });
              }
            })
            .catch(() => {}); // Ignore background update errors
          return response;
        }
        
        console.log('[Service Worker] Fetching from network:', request.url);
        return fetch(request).then((response) => {
          // Don't cache non-successful responses
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Clone the response
          const responseToCache = response.clone();

          caches.open(RUNTIME_CACHE)
            .then((cache) => {
              cache.put(request, responseToCache);
            });

          return response;
        });
      })
      .catch((error) => {
        console.log('[Service Worker] Fetch error:', error);
        return new Response('Offline - Resource not available', { 
          status: 503,
          statusText: 'Service Unavailable'
        });
      })
  );
});
