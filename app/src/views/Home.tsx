import type { Overview } from '../lib/queue'

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`
}

export function Home(props: {
  overview: Overview
  names: Record<string, string>
  pending: number
  drafts: number
  onOpenDrafts: () => void
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
        <button className="link" onClick={props.onSettings}>Einstellungen</button>
      </header>

      <p className="summary">
        {nothing
          ? 'Für heute ist alles erledigt.'
          : `${plural(total.due, 'Wiederholung', 'Wiederholungen')} und ${plural(total.fresh, 'neue Karte', 'neue Karten')}.`}
      </p>

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
            return (
              <li key={m.module}>
                <button className={`module ${empty ? 'is-empty' : ''}`} onClick={() => props.onOpenModule(m.module)}>
                  <span className="module-label">
                    <span className="module-name">{m.module}</span>
                    {props.names[m.module] && <span className="module-sub">{props.names[m.module]}</span>}
                  </span>
                  <span className="module-counts">
                    <span className="count due" aria-label={`${m.due} fällig`}>{m.due}</span>
                    <span className="count fresh" aria-label={`${m.fresh} neu`}>{m.fresh}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {modules.length > 0 && (
        <p className="legend">
          <span className="count due">fällig</span> <span className="count fresh">neu</span>
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
