// Offline-Modus: Ablage für Notizen im Gerätespeicher (IndexedDB) und verständliche Fehler ohne Netz.

import type { Note } from './types'

/** Schlüssel-Wert-Ablage für Notizen. Im Browser IndexedDB, in Tests eine Map. */
export interface Ablage {
  lesen(id: number): Promise<Note | undefined>
  alle(): Promise<Note[]>
  schreiben(notes: Note[]): Promise<void>
}

const DB = 'studhack'
const STORE = 'notizen'

function oeffnen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export const idbAblage: Ablage = {
  async lesen(id) {
    const db = await oeffnen()
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get(id)
      req.onsuccess = () => resolve(req.result as Note | undefined)
      req.onerror = () => reject(req.error)
    })
  },
  async alle() {
    const db = await oeffnen()
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).getAll()
      req.onsuccess = () => resolve(req.result as Note[])
      req.onerror = () => reject(req.error)
    })
  },
  async schreiben(notes) {
    const db = await oeffnen()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      for (const n of notes) tx.objectStore(STORE).put(n)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  },
}

export function mapAblage(): Ablage {
  const m = new Map<number, Note>()
  return {
    async lesen(id) {
      return m.get(id)
    },
    async alle() {
      return [...m.values()]
    },
    async schreiben(notes) {
      for (const n of notes) m.set(n.id, n)
    },
  }
}

/** Pfade der Folienbilder in Markdown-Texten (![...](folien/<Kürzel>/<Bild>.jpg)), ohne "folien/", ohne Doppelte. */
export function folienPfade(texte: string[]): string[] {
  const pfade = new Set<string>()
  for (const t of texte) for (const m of t.matchAll(/!\[[^\]]*\]\(folien\/([^)\s]+)\)/g)) pfade.add(m[1])
  return [...pfade]
}

/** Notizen vorab laden höchstens einmal am Tag. */
export function vorladenFaellig(zuletzt: string | null, heute: string): boolean {
  return zuletzt !== heute
}

/** Ein Fehler, der nur heißt, dass gerade kein Netz da ist. */
export function istOffline(e: unknown, online = typeof navigator === 'undefined' ? true : navigator.onLine): boolean {
  if (!online) return true
  const text = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String(e.message) : String(e)
  return /failed to fetch|load failed|networkerror|network request failed|fetch failed/i.test(text)
}

/** Fehlertext für die Anzeige. Ohne Netz ein klarer Hinweis statt der technischen Meldung. */
export function fehlerText(e: unknown, online?: boolean): string {
  if (istOffline(e, online)) return 'Keine Verbindung. Das geht nur mit Netz.'
  return e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String(e.message) : String(e)
}
