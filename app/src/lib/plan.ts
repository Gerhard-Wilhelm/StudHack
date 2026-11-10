// Lernplan: Wochen, Zeitraster, Stunden pro Modul, Vorschlag für eine leere Woche.

import { daysUntil } from './exams'

export interface StudyBlock {
  id: number
  module: string
  /** YYYY-MM-DD */
  day: string
  /** HH:MM */
  start_time: string
  duration_min: number
  done: boolean
}

export type NewBlock = Omit<StudyBlock, 'id'> & { id?: number }

export const BLOCK_MIN = 120
export const FIRST_START = '06:00'
export const LAST_START = '20:00' // damit ein 2-Stunden-Block um 22:00 endet

const WOCHENTAGE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(day: string, n: number): string {
  const d = parseDate(day)
  d.setDate(d.getDate() + n)
  return isoDate(d)
}

/** Montag der Woche, in der day liegt. */
export function weekStart(day: string): string {
  const d = parseDate(day)
  return addDays(day, -((d.getDay() + 6) % 7))
}

export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

/** Kalenderwoche nach ISO 8601. */
export function isoWeek(day: string): number {
  const d = parseDate(day)
  const thursday = new Date(d)
  thursday.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const jan4 = new Date(thursday.getFullYear(), 0, 4)
  return 1 + Math.round(((thursday.getTime() - jan4.getTime()) / 86_400_000 - 3 + ((jan4.getDay() + 6) % 7)) / 7)
}

export function formatDay(day: string): string {
  const d = parseDate(day)
  return `${WOCHENTAGE[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`
}

export function hhmm(time: string): string {
  return time.slice(0, 5)
}

export function addMinutes(time: string, min: number): string {
  const [h, m] = hhmm(time).split(':').map(Number)
  const t = h * 60 + m + min
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

/** Startzeiten im 30-Minuten-Raster. */
export function timeSlots(): string[] {
  const out: string[] = []
  for (let t = FIRST_START; t <= LAST_START; t = addMinutes(t, 30)) out.push(t)
  return out
}

export function sortBlocks(blocks: StudyBlock[]): StudyBlock[] {
  return [...blocks].sort((a, b) => a.day.localeCompare(b.day) || hhmm(a.start_time).localeCompare(hhmm(b.start_time)))
}

export function hoursPerModule(blocks: StudyBlock[]): { module: string; hours: number }[] {
  const h = new Map<string, number>()
  for (const b of blocks) h.set(b.module, (h.get(b.module) ?? 0) + b.duration_min / 60)
  return [...h.entries()].map(([module, hours]) => ({ module, hours })).sort((a, b) => b.hours - a.hours)
}

// Feste, in hell und dunkel lesbare Farben, Zuordnung nach Reihenfolge der Module
const FARBEN = ['#c2410c', '#1d4ed8', '#047857', '#a21caf', '#b45309', '#0e7490', '#be123c', '#4d7c0f']

export function moduleColors(modules: string[]): Record<string, string> {
  return Object.fromEntries(modules.map((m, i) => [m, FARBEN[i % FARBEN.length]]))
}

// Feste Zeiten für den Vorschlag: abends unter der Woche, tagsüber am Wochenende
const VORSCHLAG_ZEITEN: [number, string][] = [
  [0, '18:00'], [1, '18:00'], [2, '18:00'], [3, '18:00'], [5, '10:00'],
  [5, '14:00'], [6, '10:00'], [4, '16:00'], [6, '14:00'], [0, '16:00'],
]

/**
 * Vorschlag für eine Woche: jedes Modul mit offener Klausur bekommt einen Block,
 * die übrigen gehen nach Klausurnähe (je näher, desto mehr).
 * Mit fromDay werden nur Tage ab diesem Tag belegt (laufende Woche), die Zahl der Blöcke sinkt entsprechend.
 */
export function suggestWeek(
  monday: string,
  exams: Record<string, string | null | undefined>,
  count = 9,
  fromDay?: string,
): NewBlock[] {
  const zeiten = VORSCHLAG_ZEITEN.filter(([d]) => !fromDay || addDays(monday, d) >= fromDay)
  count = Math.min(count, zeiten.length)
  const offen = Object.keys(exams).filter((m) => !exams[m] || daysUntil(exams[m]!, parseDate(monday)) >= 0)
  if (!offen.length || count <= 0) return []
  const gewicht = (m: string) => 1 / Math.max(exams[m] ? daysUntil(exams[m]!, parseDate(monday)) : 120, 7)
  const reihenfolge = [...offen].sort((a, b) => gewicht(b) - gewicht(a))
  const anzahl: Record<string, number> = Object.fromEntries(reihenfolge.map((m) => [m, 0]))

  // Grundausstattung: ein Block je Modul, solange Blöcke da sind
  let rest = count
  for (const m of reihenfolge) if (rest > 0) (anzahl[m]++, rest--)
  // Rest nach Gewicht, jeweils an das Modul mit dem größten Bedarf je vorhandenem Block
  while (rest > 0) {
    const m = reihenfolge.reduce((best, x) => (gewicht(x) / (anzahl[x] + 1) > gewicht(best) / (anzahl[best] + 1) ? x : best))
    anzahl[m]++
    rest--
  }

  // Abwechselnd verteilen, damit dasselbe Modul nicht zweimal hintereinander kommt
  const liste: string[] = []
  while (liste.length < count) {
    for (const m of reihenfolge) if (anzahl[m] > 0) (liste.push(m), anzahl[m]--)
  }
  return liste.slice(0, zeiten.length).map((module, i) => ({
    module,
    day: addDays(monday, zeiten[i][0]),
    start_time: zeiten[i][1],
    duration_min: BLOCK_MIN,
    done: false,
  }))
}

/** Eine Woche in eine andere kopieren (gleicher Wochentag, gleiche Zeit, nicht erledigt). */
export function copyWeek(blocks: StudyBlock[], fromMonday: string, toMonday: string): NewBlock[] {
  const versatz = Math.round((parseDate(toMonday).getTime() - parseDate(fromMonday).getTime()) / 86_400_000)
  return blocks.map(({ module, day, start_time, duration_min }) => ({
    module,
    day: addDays(day, versatz),
    start_time: hhmm(start_time),
    duration_min,
    done: false,
  }))
}
