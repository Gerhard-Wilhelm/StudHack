import type { CSSProperties } from 'react'
import { formatExam } from '../lib/exams'
import type { StudyBlock } from '../lib/plan'
import type { Overview } from '../lib/queue'

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`
}

export function Home(props: {
  overview: Overview
  names: Record<string, string>
  exams: Record<string, string>
  now: Date
  pending: number
  drafts: number
  onOpenDrafts: () => void
  today: (StudyBlock & { end: string; color?: string })[]
  onOpenPlan: () => void
  onStudyModule: (module: string) => void
  onStudy: () => void
  onOpenModule: (module: string) => void
  onSettings: () => void
}) {
  const { total, modules } = props.overview
  const nothing = total.due + total.fresh === 0

  return (
    <main className="page home">
      <header className="bar">
        <h1 className="title">Heute</h1>
        <span className="bar-links">
          <button className="link" onClick={props.onOpenPlan}>Plan</button>
          <button className="link" onClick={props.onSettings}>Einstellungen</button>
        </span>
      </header>

      <p className="summary">
        {nothing
          ? 'Für heute ist alles erledigt.'
          : `${plural(total.due, 'Wiederholung', 'Wiederholungen')} und ${plural(total.fresh, 'neue Karte', 'neue Karten')}.`}
      </p>

      {props.today.filter((b) => !b.done).length > 0 && (
        <div className="today">
          {props.today.filter((b) => !b.done).map((b) => (
            <button
              key={b.id}
              className="today-block"
              style={{ '--m': b.color ?? 'var(--ink)' } as CSSProperties}
              onClick={() => props.onStudyModule(b.module)}
            >
              <span>Heute: <strong>{b.module}</strong> {b.start_time} bis {b.end}</span>
              <span className="info-hint">Jetzt lernen</span>
            </button>
          ))}
        </div>
      )}

      {props.drafts > 0 && (
        <button className="info-row drafts-row" onClick={props.onOpenDrafts}>
          <span>{plural(props.drafts, 'Entwurf', 'Entwürfe')} prüfen</span>
          <span className="info-hint">Neue Fragen vom Generator freigeben oder verwerfen</span>
        </button>
      )}

      {props.pending > 0 && (
        <p className="note">
          {plural(props.pending, 'Bewertung ist', 'Bewertungen sind')} noch nicht gespeichert.
          Sie werden gesendet, sobald du wieder online bist.
        </p>
      )}

      {modules.length === 0 ? (
        <p className="note">Noch keine Karten und Notizen. Lade sie mit dem Importer hoch, dann tauchen sie hier auf.</p>
      ) : (
        <ul className="modules">
          {modules.map((m) => {
            const empty = m.due + m.fresh === 0
            const name = props.names[m.module]
            const exam = props.exams[m.module] ? formatExam(props.exams[m.module], props.now) : null
            return (
              <li key={m.module}>
                <button
                  className={`module ${empty ? 'is-empty' : ''} ${m.written ? 'is-written' : ''}`}
                  onClick={() => props.onOpenModule(m.module)}
                >
                  <span className="module-label">
                    <span className="module-name">{m.module}</span>
                    {name && <span className="module-sub">{name}</span>}
                    {exam && <span className={`module-exam ${m.written ? 'is-past' : ''}`}>{exam}</span>}
                  </span>
                  <span className="module-counts">
                    <span className="count due" aria-label={`${m.due} fällig`}>{m.due}</span>
                    <span className="count fresh" aria-label={`${m.fresh} ungelernt`}>{m.fresh}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {modules.length > 0 && (
        <p className="legend">
          <span className="count due">fällig</span> <span className="count fresh">ungelernt</span>
        </p>
      )}

      <footer className="dock">
        <button className="primary big" disabled={nothing} onClick={() => props.onStudy()}>
          {nothing ? 'Nichts fällig' : 'Lernen'}
        </button>
      </footer>
    </main>
  )
}
