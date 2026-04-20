// Menhera service worker — only job right now is Web Push. We deliberately
// skip caching/offline support because the app's auth and data freshness
// guarantees don't play well with stale caches. If offline-first is wanted
// later, add a fetch handler then.

self.addEventListener('install', (event) => {
  // skipWaiting lets a new SW version take over immediately after install
  // instead of waiting for all clients to close.
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  // Claim any open pages so they start receiving SW events without a reload.
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  if (!event.data) return
  let payload
  try {
    payload = event.data.json()
  } catch {
    payload = { title: 'Menhera', body: event.data.text() }
  }

  const title = payload.title || 'Menhera'
  const options = {
    body: payload.body || '',
    // 'tag' 로 같은 주제의 알림은 계속 덮어쓰기 — 스팸 방지.
    tag: payload.tag,
    data: { url: payload.url || '/' },
    icon: '/icon',
    badge: '/icon',
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      // 이미 같은 URL 의 창이 열려 있으면 포커스만.
      for (const client of allClients) {
        try {
          const url = new URL(client.url)
          if (url.pathname === targetUrl) {
            await client.focus()
            return
          }
        } catch {
          // ignore malformed URL
        }
      }
      // 아니면 새 창 열기.
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl)
      }
    })(),
  )
})
