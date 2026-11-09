import { useState } from 'react'
import { DEFAULT_NEW_LIMIT, getNewLimit, introducedToday, setNewLimit } from '../lib/settings'

export function Settings(props: {
  demo: boolean
  written: { module: string; name?: string; active: boolean }[]
  onToggleWritten: (module: string) => void
  onBack: () => void
  onLogout: () => void
  onResetDemo: () => void
}) {
  const [limit, setLimit] = useState(getNewLimit())

  function change(n: number) {
    const v = Math.max(0, Math.min(500, n))
    setLimit(v)
    setNewLimit(v)
  }

  return (
    <main className="page settings">
      <header className="bar">
        <button className="link" onClick={props.onBack}>Zurück</button>
        <h1 className="title small">Einstellungen</h1>
      </header>

      <section className="setting">
        <label htmlFor="limit">Neue Karten pro Tag</label>
        <div className="stepper">
          <button aria-label="Weniger" onClick={() => change(limit - 5)}>−</button>
          <input id="limit" type="number" inputMode="numeric" min={0} max={500}
            value={limit} onChange={(e) => change(Number(e.target.value))} />
          <button aria-label="Mehr" onClick={() => change(limit + 5)}>+</button>
        </div>
        <p className="hint">
          Standard ist {DEFAULT_NEW_LIMIT}. Heute schon eingeführt: {introducedToday(props.demo ? 'demo' : 'supabase')}.
          Gezählt wird auf diesem Gerät.
        </p>
      </section>

      {props.written.length > 0 && (
        <section className="setting">
          <label>Geschriebene Klausuren</label>
          <p className="hint">
            Nach der Klausur fragt die App ein Modul nicht mehr ab. Für eine Wiederholungsprüfung kannst du es
            wieder einschalten.
          </p>
          {props.written.map((w) => (
            <label key={w.module} className="toggle-row">
              <input type="checkbox" checked={w.active} onChange={() => props.onToggleWritten(w.module)} />
              <span>
                {w.module}
                {w.name ? `, ${w.name}` : ''} wieder abfragen
              </span>
            </label>
          ))}
        </section>
      )}

      {props.demo && (
        <section className="setting">
          <button className="quiet" onClick={props.onResetDemo}>Demo zurücksetzen</button>
        </section>
      )}

      <section className="setting">
        <button className="quiet" onClick={props.onLogout}>
          {props.demo ? 'Demo beenden' : 'Abmelden'}
        </button>
      </section>
    </main>
  )
}
