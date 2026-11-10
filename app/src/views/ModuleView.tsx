import { daysUntil, formatDate, formatExam } from '../lib/exams'
import type { Counts } from '../lib/queue'
import type { ModuleInfo, NoteSummary } from '../lib/types'

export interface WeekRow {
  week: number | null
  note?: NoteSummary
  counts: Counts
}

export function ModuleView(props: {
  module: string
  info?: ModuleInfo
  now: Date
  weeks: WeekRow[]
  /** Restkontingent neuer Karten heute */
  newLimit: number
  notesError: string | null
  onOpenWeek: (week: number | null) => void
  onOpenInfo: () => void
  onStudy: () => void
  onBack: () => void
}) {
  const due = props.weeks.reduce((s, w) => s + w.counts.due, 0)
  const fresh = props.weeks.reduce((s, w) => s + w.counts.fresh, 0)
  const total = due + Math.min(fresh, props.newLimit)

  return (
    <main className="page module-view">
      <header className="bar">
        <button className="link" onClick={props.onBack}>Zurück</button>
      </header>
      <h1 className="title">{props.module}</h1>
      {props.info && (
        <>
          <p className="module-fullname">{props.info.name}</p>
          {props.info.exam_date && (
            <p className={`exam-line ${daysUntil(props.info.exam_date, props.now) < 0 ? 'is-past' : ''}`}>
              {formatExam(props.info.exam_date, props.now)}, {formatDate(props.info.exam_date)}
            </p>
          )}
          <button className="info-row" onClick={props.onOpenInfo}>
            <span>Infos zum Modul</span>
            <span className="info-hint">Eckdaten, Ablauf, Lernmethoden</span>
          </button>
        </>
      )}

      {props.notesError && <p className="note">Zusammenfassungen konnten nicht geladen werden: {props.notesError}</p>}

      {props.weeks.length === 0 ? (
        <p className="note">Für dieses Modul gibt es noch keine Wochen.</p>
      ) : (
        <ul className="weeks">
          {props.weeks.map((w) => (
            <li key={w.week ?? 'ohne'}>
              <button className="week" onClick={() => props.onOpenWeek(w.week)}>
                <span className="week-no">{w.week ? `W${String(w.week).padStart(2, '0')}` : ''}</span>
                <span className="week-title">
                  {w.note?.title ?? (w.week ? 'Noch keine Zusammenfassung' : 'Ohne Woche')}
                </span>
                <span className="module-counts">
                  <span className="count due" aria-label={`${w.counts.due} fällig`}>{w.counts.due}</span>
                  <span className="count fresh" aria-label={`${w.counts.fresh} ungelernt`}>{w.counts.fresh}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="legend">
        <span className="count due">fällig</span> <span className="count fresh">ungelernt</span>
      </p>

      <footer className="dock">
        <button className="primary big" disabled={total === 0} onClick={props.onStudy}>
          {total === 0 ? 'Nichts fällig' : `${props.module} lernen`}
        </button>
      </footer>
    </main>
  )
}
