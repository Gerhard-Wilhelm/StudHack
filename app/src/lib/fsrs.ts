import { fsrs, type Card } from 'ts-fsrs'
import type { CardStateFields, Grade } from './types'

const scheduler = fsrs({ enable_fuzz: true })

const DAY_MS = 86_400_000

export function toCard(s: CardStateFields): Card {
  return {
    due: new Date(s.due),
    stability: s.stability,
    difficulty: s.difficulty,
    scheduled_days: s.scheduled_days,
    learning_steps: s.learning_steps,
    reps: s.reps,
    lapses: s.lapses,
    state: s.state,
    last_review: s.last_review ? new Date(s.last_review) : undefined,
  }
}

/**
 * ts-fsrs 6 kennt elapsed_days nicht mehr. Die Spalte gibt es in der Datenbank
 * trotzdem, deshalb rechnen wir sie selbst: ganze Tage seit der vorigen Abfrage.
 */
export function fromCard(card: Card, previous: CardStateFields, now: Date): CardStateFields {
  const elapsed = previous.last_review
    ? Math.max(0, Math.floor((now.getTime() - new Date(previous.last_review).getTime()) / DAY_MS))
    : 0
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: elapsed,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state as CardStateFields['state'],
    last_review: card.last_review ? card.last_review.toISOString() : now.toISOString(),
  }
}

/** Neuer Zustand nach einer Bewertung. */
export function rate(s: CardStateFields, grade: Grade, now: Date): CardStateFields {
  return fromCard(scheduler.next(toCard(s), now, grade).card, s, now)
}

/** Fälligkeit je Bewertung, für die Beschriftung der Knöpfe. */
export function preview(s: CardStateFields, now: Date): Record<Grade, Date> {
  const p = scheduler.repeat(toCard(s), now)
  return { 1: p[1].card.due, 2: p[2].card.due, 3: p[3].card.due, 4: p[4].card.due }
}

/** Abstand kurz und lesbar: "1 Min", "3 Std", "4 T", "2 Mon", "1,5 J". */
export function formatInterval(from: Date, to: Date): string {
  const min = Math.max(1, Math.round((to.getTime() - from.getTime()) / 60_000))
  if (min < 60) return `${min} Min`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} Std`
  const d = Math.round(min / 1440)
  if (d < 31) return `${d} T`
  if (d < 365) return `${Math.round(d / 30)} Mon`
  return `${(d / 365).toFixed(1).replace('.', ',').replace(',0', '')} J`
}
