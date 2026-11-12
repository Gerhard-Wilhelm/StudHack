import { useState, type CSSProperties } from 'react'
import { PushSettings } from '../components/PushSettings'
import { FARBWAHL, KUERZEL_MAX, normKuerzel, type ModulWahl } from '../lib/farben'
import { useKuerzel } from '../lib/kuerzel'
import { fehlerText } from '../lib/offline'
import { DEFAULT_NEW_LIMIT, getNewLimit, introducedToday, setNewLimit } from '../lib/settings'

type Reiter = 'lernen' | 'module' | 'mitteilungen' | 'offline' | 'konto'

const REITER_KEY = 'studhack.einstellungen'

function gemerkterReiter(): Reiter {
  try {
    return (localStorage.getItem(REITER_KEY) as Reiter | null) ?? 'lernen'
  } catch {
    return 'lernen'
  }
}

export interface ModulFarbe {
  module: string
  name?: string
  /** aktuelle Farbe, selbst gewählt oder automatisch */
  color?: string
  /** true, wenn die Farbe selbst gewählt ist */
  eigeneFarbe: boolean
  /** eigenes Kürzel, fehlt beim Original */
  kuerzel?: string
}

export function Settings(props: {
  demo: boolean
  written: { module: string; name?: string; active: boolean }[]
  onToggleWritten: (module: string) => void
  onBack: () => void
  onLogout: () => void
  onResetDemo: () => void
  /** Offline-Modus: alle Folienbilder aufs Gerät laden (nur mit Supabase) */
  bilderVorladen?: (fortschritt: (fertig: number, gesamt: number) => void) => Promise<number>
  modules: ModulFarbe[]
  /** Farbe oder Kürzel ändern; ein leeres Feld heißt Standard */
  onChange: (module: string, aenderung: ModulWahl) => Promise<void>
}) {
  const kurz = useKuerzel()
  const [limit, setLimit] = useState(getNewLimit())
  const [bilder, setBilder] = useState<string | null>(null)
  const [laedt, setLaedt] = useState(false)
  const [offen, setOffen] = useState<string | null>(null)
  const [farbFehler, setFarbFehler] = useState<string | null>(null)

  const reiter: { id: Reiter; titel: string }[] = [
    { id: 'lernen', titel: 'Lernen' },
    { id: 'module', titel: 'Module' },
    ...(props.demo ? [] : [{ id: 'mitteilungen' as const, titel: 'Mitteilungen' }]),
    ...(props.bilderVorladen ? [{ id: 'offline' as const, titel: 'Offline' }] : []),
    { id: 'konto', titel: 'Konto' },
  ]
  const [aktiv, setAktiv] = useState<Reiter>(() => {
    const g = gemerkterReiter()
    return reiter.some((r) => r.id === g) ? g : 'lernen'
  })

  function waehle(r: Reiter) {
    setAktiv(r)
    try {
      localStorage.setItem(REITER_KEY, r)
    } catch {
      // dann eben ohne Merken
    }
  }

  async function bilderLaden() {
    if (!props.bilderVorladen) return
    setLaedt(true)
    try {
      const n = await props.bilderVorladen((fertig, gesamt) => setBilder(`${fertig} von ${gesamt} Folienbildern geladen.`))
      setBilder(n ? `Alle ${n} Folienbilder sind offline verfügbar.` : 'Keine Folienbilder gefunden. Öffne die App einmal mit Netz, damit die Notizen gespeichert werden.')
    } catch (e) {
      setBilder(fehlerText(e))
    } finally {
      setLaedt(false)
    }
  }

  async function aendern(module: string, aenderung: ModulWahl) {
    setFarbFehler(null)
    try {
      await props.onChange(module, aenderung)
    } catch (e) {
      setFarbFehler(`Nicht gespeichert: ${fehlerText(e)}`)
    }
  }

  function kuerzelSpeichern(m: ModulFarbe, eingabe: string) {
    const neu = normKuerzel(eingabe, m.module)
    if (neu !== m.kuerzel) void aendern(m.module, { kuerzel: neu })
  }

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

      <div className="tabs" role="tablist" aria-label="Bereiche der Einstellungen">
        {reiter.map((r) => (
          <button
            key={r.id}
            role="tab"
            id={`reiter-${r.id}`}
            aria-selected={aktiv === r.id}
            aria-controls={`bereich-${r.id}`}
            className={`tab ${aktiv === r.id ? 'is-active' : ''}`}
            onClick={() => waehle(r.id)}
          >
            {r.titel}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`bereich-${aktiv}`} aria-labelledby={`reiter-${aktiv}`}>
        {aktiv === 'lernen' && (
          <>
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

            <section className="setting">
              <label>Geschriebene Klausuren</label>
              {props.written.length === 0 ? (
                <p className="hint">Erscheinen hier nach dem Klausurtermin.</p>
              ) : (
                <>
                  <p className="hint">
                    Nach der Klausur fragt die App ein Modul nicht mehr ab. Für eine Wiederholungsprüfung kannst du es
                    wieder einschalten.
                  </p>
                  {props.written.map((w) => (
                    <label key={w.module} className="toggle-row">
                      <input type="checkbox" checked={w.active} onChange={() => props.onToggleWritten(w.module)} />
                      <span>
                        {kurz(w.module)}
                        {w.name ? `, ${w.name}` : ''} wieder abfragen
                      </span>
                    </label>
                  ))}
                </>
              )}
            </section>
          </>
        )}

        {aktiv === 'module' && (
          <section className="setting">
            <p className="hint">
              Kürzel und Farbe für Startseite, Lernplan und Lernkarte. {props.demo ? 'In der Demo nur auf diesem Gerät.' : 'Gilt auf allen Geräten.'}
            </p>
            {props.modules.length === 0 && <p className="hint">Noch keine Module.</p>}
            <ul className="color-list">
              {props.modules.map((m) => (
                <li key={m.module} className="color-row" style={{ '--m': m.color } as CSSProperties}>
                  <button
                    className="color-head"
                    aria-expanded={offen === m.module}
                    onClick={() => setOffen((o) => (o === m.module ? null : m.module))}
                  >
                    <span className="color-dot" aria-hidden="true" />
                    <span className="color-name">{m.kuerzel ?? m.module}</span>
                    {(m.kuerzel || m.name) && (
                      <span className="color-sub">{[m.kuerzel && m.module, m.name].filter(Boolean).join(', ')}</span>
                    )}
                  </button>
                  {offen === m.module && (
                    <>
                    <label className="kuerzel-feld">
                      <span>Kürzel</span>
                      <input
                        key={m.kuerzel ?? ''}
                        type="text"
                        defaultValue={m.kuerzel ?? ''}
                        placeholder={m.module}
                        maxLength={KUERZEL_MAX}
                        autoCapitalize="characters"
                        autoCorrect="off"
                        spellCheck={false}
                        enterKeyHint="done"
                        onBlur={(e) => kuerzelSpeichern(m, e.currentTarget.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') e.currentTarget.blur()
                        }}
                      />
                    </label>
                    <div className="swatches">
                      {FARBWAHL.map((f) => (
                        <button
                          key={f.farbe}
                          className="swatch"
                          style={{ '--m': f.farbe } as CSSProperties}
                          aria-label={f.name}
                          aria-pressed={m.color === f.farbe}
                          onClick={() => void aendern(m.module, { color: f.farbe })}
                        />
                      ))}
                      {(m.eigeneFarbe || m.kuerzel) && (
                        <button className="link swatch-reset" onClick={() => void aendern(m.module, { color: undefined, kuerzel: undefined })}>
                          Standard wiederherstellen
                        </button>
                      )}
                    </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
            {farbFehler && <p className="error" role="alert">{farbFehler}</p>}
          </section>
        )}

        {aktiv === 'mitteilungen' && <PushSettings />}

        {aktiv === 'offline' && (
          <section className="setting">
            <label>Offline</label>
            <p className="hint">
              Karten und Wochennotizen speichert die App selbst auf diesem Gerät. Folienbilder nur, wenn du sie
              einmal angesehen hast. Hier lädst du alle auf einmal, am besten im WLAN.
            </p>
            <button className="quiet" disabled={laedt} onClick={() => void bilderLaden()}>
              Folienbilder für offline laden
            </button>
            {bilder && <p className="hint" role="status">{bilder}</p>}
          </section>
        )}

        {aktiv === 'konto' && (
          <>
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
          </>
        )}
      </div>
    </main>
  )
}
