import { useEffect, useState } from 'react'
import {
  ALLE_AN, ARTEN, ladePrefs, pushAusschalten, pushEinschalten, pushStatus, speicherePrefs, testmitteilung,
  type Art, type Prefs, type PushStatus,
} from '../lib/push'
import { fehlerText } from '../lib/offline'

const HINWEIS: Partial<Record<PushStatus, string>> = {
  'kein-supabase': 'Mitteilungen gehen nur mit Anmeldung.',
  'kein-schluessel': 'Der Push-Schlüssel fehlt (VITE_VAPID_PUBLIC_KEY). Siehe Anleitung, Abschnitt Mitteilungen.',
  'nicht-installiert': 'Mitteilungen gehen auf dem iPhone nur, wenn die App vom Home-Bildschirm geöffnet ist.',
  'nicht-unterstuetzt': 'Dieser Browser unterstützt keine Mitteilungen.',
  verweigert: 'Mitteilungen sind blockiert. Erlauben unter iOS-Einstellungen, Mitteilungen, Lernkartei.',
}

export function PushSettings() {
  const [status, setStatus] = useState<PushStatus | null>(null)
  const [prefs, setPrefs] = useState<Prefs>(ALLE_AN)
  const [busy, setBusy] = useState(false)
  const [meldung, setMeldung] = useState<string | null>(null)

  useEffect(() => {
    let aktiv = true
    void (async () => {
      const s = await pushStatus()
      if (!aktiv) return
      setStatus(s)
      if (s === 'an') setPrefs(await ladePrefs().catch(() => ALLE_AN))
    })()
    return () => {
      aktiv = false
    }
  }, [])

  async function machen(f: () => Promise<void>) {
    setBusy(true)
    setMeldung(null)
    try {
      await f()
    } catch (e) {
      setMeldung(fehlerText(e))
    } finally {
      setBusy(false)
    }
  }

  function umschalten(art: Art) {
    const neu = { ...prefs, [art]: !prefs[art] }
    setPrefs(neu)
    void machen(() => speicherePrefs(neu))
  }

  return (
    <section className="setting">
      <label>Mitteilungen</label>
      {status === null ? null : HINWEIS[status] ? (
        <p className="hint">{HINWEIS[status]}</p>
      ) : status === 'aus' ? (
        <>
          <p className="hint">Erinnerungen an Lernblöcke, offene Wiederholungen und den Wochenplan auf diesem Gerät.</p>
          <button
            className="quiet"
            disabled={busy}
            onClick={() => void machen(async () => {
              setPrefs(await pushEinschalten())
              setStatus('an')
            })}
          >
            Mitteilungen einschalten
          </button>
        </>
      ) : (
        <>
          {ARTEN.map((a) => (
            <label key={a.art} className="toggle-row">
              <input type="checkbox" checked={prefs[a.art]} disabled={busy} onChange={() => umschalten(a.art)} />
              <span>
                {a.label}
                <small className="toggle-hint">{a.hint}</small>
              </span>
            </label>
          ))}
          <p className="hint">Ruhezeit 22:00 bis 07:00, nur Lernblöcke melden sich auch dann.</p>
          <div className="setting-actions">
            <button
              className="quiet"
              disabled={busy}
              onClick={() => void machen(async () => {
                const n = await testmitteilung()
                setMeldung(n ? 'Testmitteilung verschickt.' : 'Kein Gerät gefunden. Bitte aus- und wieder einschalten.')
              })}
            >
              Testmitteilung senden
            </button>
            <button
              className="link"
              disabled={busy}
              onClick={() => void machen(async () => {
                await pushAusschalten()
                setStatus('aus')
              })}
            >
              Ausschalten
            </button>
          </div>
        </>
      )}
      {meldung && <p className="hint" role="status">{meldung}</p>}
    </section>
  )
}
