// Pratium Service Worker v2 — Offline Cache + Push Notifications

const CACHE_NAME = 'pratium-v2'
const STATIC_ASSETS = [
  '/',
  '/quiz',
  '/dashboard',
  '/review',
  '/daily',
  '/offline',
  '/manifest.json',
  '/logo-192.png',
  '/logo-512.png',
  '/favicon.ico',
  '/pratium-logo-new.svg',
]

// ── Install: statik dosyaları cache'e al ─────────────────────────────────────
self.addEventListener('install', function(event) {
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // Bazı dosyalar yoksa sessizce geç
      })
    })
  )
})

// ── Activate: eski cache'leri temizle ────────────────────────────────────────
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => clients.claim())
  )
})

// ── Fetch: Network-first, Cache fallback ─────────────────────────────────────
self.addEventListener('fetch', function(event) {
  const { request } = event
  const url = new URL(request.url)

  // API isteklerini cache'leme
  if (url.pathname.startsWith('/api/')) return

  // Sadece GET isteklerini cache'le
  if (request.method !== 'GET') return

  // HTML sayfaları — Network first, offline fallback
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then(res => {
          // Başarılı response'u cache'e yaz
          const clone = res.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone))
          return res
        })
        .catch(() => {
          // Offline: cache'den getir
          return caches.match(request)
            .then(cached => cached || caches.match('/offline'))
        })
    )
    return
  }

  // Statik dosyalar (logo, font, css) — Cache first, Network fallback
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached
      return fetch(request).then(res => {
        if (!res || res.status !== 200) return res
        const clone = res.clone()
        caches.open(CACHE_NAME).then(cache => cache.put(request, clone))
        return res
      }).catch(() => cached || new Response('', { status: 404 }))
    })
  )
})

// ── Push Notifications ────────────────────────────────────────────────────────
self.addEventListener('push', function(event) {
  if (!event.data) return
  const data = event.data.json()
  const options = {
    body: data.body || 'Pratium\'dan yeni bir bildirim var!',
    icon: '/logo-192.png',
    badge: '/logo-192.png',
    vibrate: [100, 50, 100],
    data: { url: data.url || '/quiz' },
    actions: [
      { action: 'open', title: '🚀 Hemen Git' },
      { action: 'close', title: 'Kapat' }
    ]
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Pratium', options)
  )
})

self.addEventListener('notificationclick', function(event) {
  event.notification.close()
  if (event.action === 'close') return
  const url = event.notification.data?.url || '/quiz'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      if (clients.openWindow) return clients.openWindow(url)
    })
  )
})
