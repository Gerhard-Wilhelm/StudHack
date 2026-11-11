// Klausurtermine: Countdown, Pause nach der Klausur, Verteilung neuer Karten nach Dringlichkeit.

const DAY_MS = 86_400_000
const REACTIVATED_KEY = 'studhack.reactivated'

/** Ganze Kalendertage von heute bis zum Termin (YYYY-MM-DD), am Klausurtag 0. */
export function daysUntil(examDate: string, now: Date): number {
  const [y, m, d] = examDate.split('-').map(Number)
  const exam = Date.UTC(y, m - 1, d)
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((exam - today) / DAY_MS)
}

/** Klausur liegt hinter uns (der Klausurtag selbst zählt noch als offen). */
export function isWritten(examDate: string | null | undefined, now: Date): boolean {
  return !!examDate && daysUntil(examDate, now) < 0
}

export function formatExam(examDate: string, now: Date): string {
  const n = daysUntil(examDate, now)
  if (n < 0) return 'Klausur geschrieben'
  if (n === 0) return 'Klausur heute'
  if (n === 1) return 'Klausur morgen'
  return `Klausur in ${n} Tagen`
}

export function formatDate(examDate: string): string {
  const [y, m, d] = examDate.split('-').map(Number)
  const wd = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  return `${wd} ${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`
}

/** Module, die trotz geschriebener Klausur wieder abgefragt werden (z. B. Wiederholungsprüfung). */
export function getReactivated(): string[] {
  try {
    return JSON.parse(localStorage.getItem(REACTIVATED_KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}

export function setReactivated(modules: string[]) {
  try {
    localStorage.setItem(REACTIVATED_KEY, JSON.stringify(modules))
  } catch {
    // ohne Speicher gilt die Einstellung nur bis zum Neuladen
  }
}

/** Gewicht der Dringlichkeit: je näher die Klausur, desto mehr neue Karten. Ohne Termin wie in 60 Tagen. */
export function urgency(examDate: string | null | undefined, now: Date): number {
  const days = examDate ? daysUntil(examDate, now) : 60
  return 1 / Math.max(days, 7)
}

/**
 * Verteilt das Tageslimit neuer Karten auf die Module nach Gewicht (größte Reste zuerst).
 * Was ein Modul nicht braucht, weil es weniger neue Karten hat, geht an die anderen.
 */
export function allocateNew(
  available: Record<string, number>,
  weights: Record<string, number>,
  limit: number,
): Record<string, number> {
  const quota: Record<string, number> = Object.fromEntries(Object.keys(available).map((m) => [m, 0]))
  let rest = Math.max(0, limit)
  let open = Object.keys(available).filter((m) => available[m] > 0)
  while (rest > 0 && open.length) {
    const sum = open.reduce((s, m) => s + (weights[m] ?? 0), 0) || open.length
    const share = open.map((m) => ({ m, x: (rest * ((weights[m] ?? 0) || (sum === open.length ? 1 : 0))) / sum }))
    let vergeben = 0
    for (const { m, x } of share) {
      const n = Math.min(Math.floor(x), available[m] - quota[m])
      quota[m] += n
      vergeben += n
    }
    // Reste nach größtem Nachkommaanteil, je eine Karte
    for (const { m } of [...share].sort((a, b) => (b.x % 1) - (a.x % 1))) {
      if (vergeben >= rest) break
      if (quota[m] < available[m]) {
        quota[m]++
        vergeben++
      }
    }
    rest -= vergeben
    open = open.filter((m) => quota[m] < available[m])
    if (vergeben === 0) break
  }
  return quota
}

/**
 * Quote neuer Karten für heute. Sind heute Lernblöcke geplant, bekommen nur deren Module neue Karten,
 * aufgeteilt nach geplanten Minuten. Ohne Block, oder wenn die Block-Module nichts Neues mehr haben,
 * gilt die Verteilung nach Klausurnähe.
 */
export function dailyQuota(
  available: Record<string, number>,
  exams: Record<string, string | null | undefined>,
  blocks: { module: string; duration_min: number }[],
  limit: number,
  now: Date,
): Record<string, number> {
  const minuten: Record<string, number> = {}
  for (const b of blocks) if (available[b.module]) minuten[b.module] = (minuten[b.module] ?? 0) + b.duration_min
  if (Object.keys(minuten).length) {
    const verfuegbar = Object.fromEntries(Object.keys(minuten).map((m) => [m, available[m]]))
    return { ...Object.fromEntries(Object.keys(available).map((m) => [m, 0])), ...allocateNew(verfuegbar, minuten, limit) }
  }
  const weights = Object.fromEntries(Object.keys(available).map((m) => [m, urgency(exams[m], now)]))
  return allocateNew(available, weights, limit)
}

export type Dringlichkeit = 'fern' | 'nah' | 'knapp'

/** Farbe des Countdowns: mehr als 4 Wochen fern, 2 bis 4 Wochen nah, unter 2 Wochen knapp. */
export function dringlichkeit(examDate: string, now: Date): Dringlichkeit {
  const n = daysUntil(examDate, now)
  return n < 14 ? 'knapp' : n <= 28 ? 'nah' : 'fern'
}
