// Service Worker der Lernkartei: zeigt Mitteilungen an und öffnet beim Tippen die passende Ansicht.
// Noch ohne Zwischenspeicher, der kommt mit dem Offline-Modus.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  // iOS verlangt zu jedem Push eine sichtbare Mitteilung
  event.waitUntil(
    self.registration.showNotification(data.title || 'Lernkartei', {
      body: data.body || '',
      tag: data.tag,
      icon: 'icons/icon-192.png',
      data: { url: data.url || './' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || './', self.registration.scope).href
  event.waitUntil(
    (async () => {
      const fenster = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const f of fenster) {
        if ('focus' in f) {
          await f.focus()
          if ('navigate' in f) await f.navigate(url).catch(() => undefined)
          return
        }
      }
      await self.clients.openWindow(url)
    })(),
  )
})
