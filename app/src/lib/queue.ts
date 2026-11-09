import type { StudyCard } from './types'

export function isDue(c: StudyCard, now: Date): boolean {
  return c.state.state !== 0 && new Date(c.state.due).getTime() <= now.getTime()
}

export function isNew(c: StudyCard): boolean {
  return c.state.state === 0
}

function byWeekThenId(a: StudyCard, b: StudyCard): number {
  const wa = a.item.week ?? 99
  const wb = b.item.week ?? 99
  return wa - wb || a.item.id - b.item.id
}

/**
 * Erst fällige Wiederholungen nach Fälligkeit, dann neue Karten nach Woche.
 * Mit newQuota bekommt jedes Modul höchstens so viele neue Karten (Verteilung nach Klausurnähe).
 */
export function buildQueue(
  cards: StudyCard[],
  opts: { now: Date; newLimit: number; module?: string; week?: number | null; newQuota?: Record<string, number> },
): StudyCard[] {
  const pool = cards.filter(
    (c) =>
      (opts.module === undefined || c.item.module === opts.module) &&
      (opts.week === undefined || c.item.week === opts.week),
  )
  const due = pool
    .filter((c) => isDue(c, opts.now))
    .sort((a, b) => new Date(a.state.due).getTime() - new Date(b.state.due).getTime())
  let fresh = pool.filter(isNew).sort(byWeekThenId)
  if (opts.newQuota && opts.module === undefined) {
    const taken: Record<string, number> = {}
    fresh = fresh.filter((c) => {
      const m = c.item.module
      taken[m] = (taken[m] ?? 0) + 1
      return taken[m] <= (opts.newQuota![m] ?? 0)
    })
  }
  return [...due, ...fresh.slice(0, opts.newLimit)]
}

export interface Counts {
  due: number
  fresh: number
}

export interface Overview {
  total: Counts
  modules: (Counts & { module: string; written?: boolean })[]
}

/** Neue Karten je Modul, Grundlage für die Verteilung des Tageslimits. */
export function newPerModule(cards: StudyCard[]): Record<string, number> {
  const n: Record<string, number> = {}
  for (const c of cards) n[c.item.module] = (n[c.item.module] ?? 0) + (isNew(c) ? 1 : 0)
  return n
}

/**
 * Zahlen für die Startseite. Neue Karten sind auf das Restkontingent gedeckelt,
 * mit quota zusätzlich auf den Anteil jedes Moduls.
 */
export function overview(cards: StudyCard[], now: Date, newLimit: number, quota?: Record<string, number>): Overview {
  const map = new Map<string, Counts>()
  for (const c of cards) {
    const m = map.get(c.item.module) ?? { due: 0, fresh: 0 }
    if (isDue(c, now)) m.due++
    else if (isNew(c)) m.fresh++
    map.set(c.item.module, m)
  }
  const modules = [...map.entries()]
    .map(([module, m]) => ({ module, due: m.due, fresh: Math.min(m.fresh, newLimit, quota?.[module] ?? Infinity) }))
    .sort((a, b) => a.module.localeCompare(b.module, 'de'))
  const due = modules.reduce((s, m) => s + m.due, 0)
  const allNew = quota ? modules.reduce((s, m) => s + m.fresh, 0) : [...map.values()].reduce((s, m) => s + m.fresh, 0)
  return { total: { due, fresh: Math.min(allNew, newLimit) }, modules }
}

/** Fällige und neue Karten je Woche eines Moduls. Neue sind auf das Restkontingent gedeckelt. */
export function weekCounts(
  cards: StudyCard[],
  module: string,
  now: Date,
  newLimit: number,
): Map<number | null, Counts> {
  const map = new Map<number | null, Counts>()
  for (const c of cards) {
    if (c.item.module !== module) continue
    const w = map.get(c.item.week) ?? { due: 0, fresh: 0 }
    if (isDue(c, now)) w.due++
    else if (isNew(c)) w.fresh++
    map.set(c.item.week, w)
  }
  for (const w of map.values()) w.fresh = Math.min(w.fresh, newLimit)
  return map
}

/**
 * Nächste Warteschlange nach einer Bewertung: die vorderste Karte fällt weg,
 * bei "Nochmal" kommt sie mit neuem Zustand ans Ende.
 */
export function advance(queue: StudyCard[], updated: StudyCard, again: boolean): StudyCard[] {
  const rest = queue.slice(1)
  return again ? [...rest, updated] : rest
}
