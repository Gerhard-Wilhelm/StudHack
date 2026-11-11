// Service Worker der Lernkartei: hält die App offline startbar und zeigt Mitteilungen an.
//
// Zwischenspeicher:
//   App      Startseite zuerst aus dem Netz (neue Version kommt sofort an), ohne Netz aus dem Speicher.
//            Dateien unter assets/ und icons/ aus dem Speicher, weil ihr Name sich mit jeder Version ändert.
//            Beim Laden der Startseite werden Haupt-JS, CSS und Schriften vorab gespeichert. Teile, die erst
//            bei Bedarf laden (Mermaid), landen beim ersten Gebrauch im Speicher.
//   Folien   Folienbilder zuerst aus dem Netz, ohne Netz aus dem Speicher. Schlüssel ist der Pfad ohne den
//            ablaufenden Token der signierten Adresse.

const APP = 'studhack-app-v1'
const FOLIEN = 'studhack-folien-v1'
const STEMPEL = 'x-gespeichert'
// Nicht mehr verwendete App-Dateien fliegen nach dieser Zeit raus
const ALTER_MS = 30 * 86_400_000
const FESTE = ['manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png']
const FOLIEN_PFAD = /\/storage\/v1\/object\/(?:sign|public|authenticated)\/folien\//

self.addEventListener('install', (event) => {
  event.waitUntil(vorladen().catch(() => undefined))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith('studhack-') && name !== APP && name !== FOLIEN) await caches.delete(name)
      }
      await self.clients.claim()
    })(),
  )
})

/** Antwort mit Zeitstempel versehen, damit alte Dateien später erkennbar sind. */
function stempeln(res) {
  const headers = new Headers(res.headers)
  headers.set(STEMPEL, String(Date.now()))
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
}

function absolut(pfad) {
  return new URL(pfad, self.registration.scope).href
}

/** Startseite und alles, was sie zum Start braucht, in den Speicher. Räumt danach Altes auf. */
async function vorladen(startseite) {
  const cache = await caches.open(APP)
  const res = startseite ?? (await fetch(absolut('./'), { cache: 'no-store' }))
  if (!res.ok) return
  const html = await res.clone().text()
  await cache.put(absolut('./'), stempeln(res))

  const dateien = new Set(FESTE.map(absolut))
  for (const m of html.matchAll(/(?:src|href)="\.?\/?(assets\/[^"]+)"/g)) dateien.add(absolut(m[1]))
  // Schriften aus dem CSS (KaTeX), nur woff2, das nehmen alle aktuellen Browser
  for (const url of [...dateien].filter((u) => u.endsWith('.css'))) {
    const css = await holen(cache, url)
    if (!css) continue
    for (const m of (await css.text()).matchAll(/url\(\.?\/?([^)"']+\.woff2)\)/g)) {
      dateien.add(new URL(m[1], url).href)
    }
  }
  for (const url of dateien) await holen(cache, url)
  await aufraeumen(cache, dateien)
}

/** Aus dem Speicher oder, falls nicht da, aus dem Netz holen und speichern. */
async function holen(cache, url) {
  const da = await cache.match(url)
  if (da) return da
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    await cache.put(url, stempeln(res.clone()))
    return res
  } catch {
    return null
  }
}

async function aufraeumen(cache, behalten) {
  const grenze = Date.now() - ALTER_MS
  for (const req of await cache.keys()) {
    if (behalten.has(req.url) || !req.url.includes('/assets/')) continue
    const res = await cache.match(req)
    if (Number(res?.headers.get(STEMPEL) ?? 0) < grenze) await cache.delete(req)
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  if (FOLIEN_PFAD.test(url.pathname)) {
    event.respondWith(folie(req, url))
    return
  }
  if (url.origin !== self.location.origin) return

  if (req.mode === 'navigate') {
    event.respondWith(seite(event, req))
    return
  }
  if (url.pathname.includes('/assets/') || url.pathname.includes('/icons/') || url.pathname.endsWith('.webmanifest')) {
    event.respondWith(datei(req))
  }
})

async function seite(event, req) {
  try {
    const res = await fetch(req)
    // Nur die Startseite selbst merken, Links aus Mitteilungen (?lernen=...) zeigen auf dieselbe Seite
    if (res.ok) event.waitUntil(vorladen(res.clone()).catch(() => undefined))
    return res
  } catch {
    const cache = await caches.open(APP)
    return (await cache.match(absolut('./'))) ?? Response.error()
  }
}

async function datei(req) {
  const cache = await caches.open(APP)
  const da = await cache.match(req)
  if (da) return da
  const res = await fetch(req)
  if (res.ok) await cache.put(req, stempeln(res.clone()))
  return res
}

async function folie(req, url) {
  // Signierte Adressen und die Ersatzadresse ohne Netz kodieren Umlaute verschieden
  const schluessel = url.origin + decodeURIComponent(url.pathname)
  const cache = await caches.open(FOLIEN)
  try {
    const res = await fetch(req)
    if (res.ok) await cache.put(schluessel, res.clone())
    return res
  } catch {
    return (await cache.match(schluessel)) ?? Response.error()
  }
}

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
