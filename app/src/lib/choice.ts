import type { Item } from './types'

export type Mark = 'correct' | 'wrong' | 'missed' | ''

export function isChoice(item: Item): boolean {
  return (item.type === 'single_choice' || item.type === 'multiple_choice') && !!item.options?.choices.length
}

export function correctSet(item: Item): number[] {
  const c = item.options?.correct
  return c === undefined ? [] : Array.isArray(c) ? c : [c]
}

/** Zufällige Reihenfolge der Antworten (Fisher-Yates), damit man sich keine Position merkt. */
export function shuffledOrder(n: number, random: () => number = Math.random): number[] {
  const order = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return order
}

/** Auswertung: richtig nur, wenn genau die richtigen Antworten gewählt sind. Marken je Originalposition. */
export function evaluate(selected: number[], correct: number[], n: number): { ok: boolean; marks: Mark[] } {
  const sel = new Set(selected)
  const cor = new Set(correct)
  const marks = Array.from({ length: n }, (_, i): Mark =>
    cor.has(i) ? (sel.has(i) ? 'correct' : 'missed') : sel.has(i) ? 'wrong' : '',
  )
  const ok = sel.size === cor.size && [...sel].every((i) => cor.has(i))
  return { ok, marks }
}
