const CACHE_NAME = 'hydra-remote-v4'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

// Network-first for everything — cache is only an offline fallback
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  const requestUrl = new URL(event.request.url)
  if (requestUrl.origin !== self.location.origin) return

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const cloned = response.clone()
        void caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned))
        return response
      })
      .catch(() =>
        caches.match(event.request).then((cached) => {
          if (cached) return cached
          // For navigation requests, fall back to index.html for SPA routing
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html').then((index) => index ?? Response.error())
          }
          return Response.error()
        })
      )
  )
})
