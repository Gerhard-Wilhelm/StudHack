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
}) {
  return (
    <div className="rating" role="group" aria-label="Wie gut wusstest du es?">
      {BUTTONS.map((b) => (
        <button key={b.grade} className={`rate ${b.cls}`} onClick={() => props.onRate(b.grade)}>
          <span className="rate-interval">{formatInterval(props.now, props.preview[b.grade])}</span>
          <span className="rate-label">{b.label}</span>
        </button>
      ))}
    </div>
  )
}
