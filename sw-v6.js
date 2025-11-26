// ═══════════════════════════════════════════════════════════════════════════
// VILTRUM FITNESS - SERVICE WORKER V6
// Enhanced offline support with new features
// ═══════════════════════════════════════════════════════════════════════════

const CACHE_NAME = 'viltrum-fitness-v6.3.21';
const RUNTIME_CACHE = 'viltrum-runtime-v6.3.21';

// Files to cache immediately on install
const STATIC_CACHE_URLS = [
  '/',
  '/index.html',
  
  // Pages
  '/pages/dashboard.html',
  '/pages/workout.html',
  '/pages/nutrition.html',
  '/pages/workout-completion.html',
  '/pages/profile.html',
  
  // JavaScript - Core
  '/js/config.js',
  '/js/state.js',
  '/js/auth.js',
  '/js/access-control.js',
  '/js/workout.js',
  '/js/session-cache.js',
  '/js/viewport.js',
  
  // JavaScript - New Features
  '/js/workout-history.js',
  '/js/profile-manager.js',
  '/js/welcome-modal.js',
  '/js/enhanced-settings.js',
  '/js/updated-training-data.js',
  '/js/nutrition-app.js',
  '/js/nutrition-engine.js',
  
  // CSS
  '/css/main.css',
  '/css/access-control.css',
  '/css/nutrition.css',
  '/css/dashboard.css',
  '/css/workout.css',
  
  // Data
  '/food-database.json',
  '/manifest.json',
  
  // External (CDN)
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing V6...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching static assets');
        return cache.addAll(STATIC_CACHE_URLS);
      })
      .then(() => {
        console.log('[Service Worker] Installed successfully');
        return self.skipWaiting(); // Activate immediately
      })
      .catch((error) => {
        console.error('[Service Worker] Install failed:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating V6...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => {
              // Delete old versions
              return cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE;
            })
            .map((cacheName) => {
              console.log('[Service Worker] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            })
        );
      })
      .then(() => {
        console.log('[Service Worker] Activated successfully');
        return self.clients.claim(); // Take control immediately
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
  
  // Skip external domains (except CDN)
  if (!url.origin.includes(self.location.origin) && 
      !url.origin.includes('cdn.jsdelivr.net') &&
      !url.origin.includes('fonts.googleapis.com') &&
      !url.origin.includes('fonts.gstatic.com')) {
    return;
  }
  
  // Handle different strategies based on URL
  if (isStaticAsset(url)) {
    // Static assets: Cache first, fallback to network
    event.respondWith(cacheFirst(request));
  } else if (isAPICall(url)) {
    // API calls: Network first, fallback to cache
    event.respondWith(networkFirst(request));
  } else {
    // Everything else: Network first, fallback to cache
    event.respondWith(networkFirst(request));
  }
});

/**
 * Check if URL is a static asset
 */
function isStaticAsset(url) {
  return url.pathname.match(/\.(js|css|html|png|jpg|jpeg|gif|svg|woff|woff2|ttf|json)$/);
}

/**
 * Check if URL is an API call
 */
function isAPICall(url) {
  return url.hostname.includes('supabase.co') || 
         url.hostname.includes('googleapis.com') ||
         url.pathname.includes('/api/');
}

/**
 * Cache-first strategy
 * Try cache first, fallback to network, then cache the result
 */
async function cacheFirst(request) {
  try {
    // Try to get from cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Not in cache, fetch from network
    const networkResponse = await fetch(request);
    
    // Cache the new response
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.error('[Service Worker] Cache-first failed:', error);
    
    // Return offline page if available
    return caches.match('/index.html');
  }
}

/**
 * Network-first strategy
 * Try network first, fallback to cache if offline
 */
async function networkFirst(request) {
  try {
    // Try network first
    const networkResponse = await fetch(request);
    
    // Cache successful responses
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    // Network failed, try cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      console.log('[Service Worker] Serving from cache (offline):', request.url);
      return cachedResponse;
    }
    
    // Nothing in cache either, return offline page
    return caches.match('/index.html');
  }
}

// Listen for messages from clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        );
      })
    );
  }
});

// Background sync for workout data (future enhancement)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-workouts') {
    event.waitUntil(syncWorkouts());
  }
});

async function syncWorkouts() {
  try {
    // Sync workout completion data when back online
    console.log('[Service Worker] Syncing workouts...');
    // Implementation here
  } catch (error) {
    console.error('[Service Worker] Sync failed:', error);
  }
}

console.log('[Service Worker] V6.0 loaded');
