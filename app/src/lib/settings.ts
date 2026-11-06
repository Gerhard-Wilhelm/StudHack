// Einstellungen und Tageszähler im localStorage dieses Geräts.

const LIMIT_KEY = 'studhack.newLimit'
export const DEFAULT_NEW_LIMIT = 20

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // privater Modus oder voller Speicher: Einstellung gilt dann nur bis zum Neuladen
  }
}

export function getNewLimit(): number {
  const n = Number(read(LIMIT_KEY))
  return Number.isInteger(n) && n >= 0 && read(LIMIT_KEY) !== null ? n : DEFAULT_NEW_LIMIT
}

export function setNewLimit(n: number) {
  write(LIMIT_KEY, String(Math.max(0, Math.round(n))))
}

export function todayKey(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Demo und echter Lernstand zählen getrennt. */
export type Scope = 'supabase' | 'demo'

const introducedKey = (scope: Scope) => `studhack.introduced.${scope}`

/** Wie viele neue Karten heute schon eingeführt wurden. */
export function introducedToday(scope: Scope, now = new Date()): number {
  try {
    const v = JSON.parse(read(introducedKey(scope)) ?? 'null') as { day: string; count: number } | null
    return v && v.day === todayKey(now) ? v.count : 0
  } catch {
    return 0
  }
}

export function countIntroduced(scope: Scope, now = new Date()) {
  write(introducedKey(scope), JSON.stringify({ day: todayKey(now), count: introducedToday(scope, now) + 1 }))
}

export function resetIntroduced(scope: Scope) {
  try {
    localStorage.removeItem(introducedKey(scope))
  } catch {
    // nichts zu tun
  }
}

export function remainingNew(scope: Scope, now = new Date()): number {
  return Math.max(0, getNewLimit() - introducedToday(scope, now))
}
