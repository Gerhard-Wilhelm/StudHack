import type { Counts } from '../lib/queue'
import type { NoteSummary } from '../lib/types'

export interface WeekRow {
  week: number | null
  note?: NoteSummary
  counts: Counts
}

export function ModuleView(props: {
  module: string
  weeks: WeekRow[]
  notesError: string | null
  onOpenWeek: (week: number | null) => void
  onStudy: () => void
  onBack: () => void
}) {
  const total = props.weeks.reduce((s, w) => s + w.counts.due + w.counts.fresh, 0)

  return (
    <main className="page module-view">
      <header className="bar">
        <button className="link" onClick={props.onBack}>Zurück</button>
      </header>
      <h1 className="title">{props.module}</h1>

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
                  <span className="count fresh" aria-label={`${w.counts.fresh} neu`}>{w.counts.fresh}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="legend">
        <span className="count due">fällig</span> <span className="count fresh">neu</span>
      </p>

      <footer className="dock">
        <button className="primary big" disabled={total === 0} onClick={props.onStudy}>
          {total === 0 ? 'Nichts fällig' : `${props.module} lernen`}
        </button>
      </footer>
    </main>
  )
}
