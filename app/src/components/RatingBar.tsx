import { formatInterval } from '../lib/fsrs'
import type { Grade } from '../lib/types'

const BUTTONS: { grade: Grade; label: string; cls: string }[] = [
  { grade: 1, label: 'Nochmal', cls: 'again' },
  { grade: 2, label: 'Schwer', cls: 'hard' },
  { grade: 3, label: 'Gut', cls: 'good' },
  { grade: 4, label: 'Leicht', cls: 'easy' },
]

export function RatingBar(props: {
  now: Date
  preview: Record<Grade, Date>
  onRate: (g: Grade) => void
  /** Vorschlag nach einer Auswahlfrage: Nochmal bei Fehler, Gut wenn richtig */
  suggested?: Grade
}) {
  return (
    <div className="rating" role="group" aria-label="Wie gut wusstest du es?">
      {BUTTONS.map((b) => (
        <button
          key={b.grade}
          className={`rate ${b.cls} ${props.suggested === b.grade ? 'is-suggested' : ''}`}
          aria-describedby={props.suggested === b.grade ? 'rate-hint' : undefined}
          onClick={() => props.onRate(b.grade)}
        >
          <span className="rate-interval">{formatInterval(props.now, props.preview[b.grade])}</span>
          <span className="rate-label">{b.label}</span>
        </button>
      ))}
      {props.suggested && <span id="rate-hint" className="visually-hidden">Vorschlag</span>}
    </div>
  )
}
