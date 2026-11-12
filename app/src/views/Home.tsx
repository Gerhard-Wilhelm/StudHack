import type { CSSProperties } from 'react'
import { dringlichkeit, formatExam } from '../lib/exams'
import { useKuerzel } from '../lib/kuerzel'
import { dauerText, naechsterBlock, type StudyBlock } from '../lib/plan'
import type { Overview } from '../lib/queue'

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`
}

function Kalender() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" />
    </svg>
  )
}

function Zahnrad() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  )
}

export function Home(props: {
  overview: Overview
  /** Farben der Module aus dem Lernplan */
  colors?: Record<string, string>
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
  const kurz = useKuerzel()
  const { total, modules } = props.overview
  const nothing = total.due + total.fresh === 0
  const naechster = naechsterBlock(props.today, props.now)
  const blockZahlen = naechster ? modules.find((m) => m.module === naechster.block.module) : undefined

  return (
    <main className="page home">
      <header className="bar">
        <h1 className="title brand">./StudHack</h1>
        <span className="bar-icons">
          <button className="icon-button" aria-label="Plan" title="Plan" onClick={props.onOpenPlan}><Kalender /></button>
          <button className="icon-button" aria-label="Einstellungen" title="Einstellungen" onClick={props.onSettings}><Zahnrad /></button>
        </span>
      </header>

      {naechster ? (
        <section className="next-block" style={{ '--m': props.colors?.[naechster.block.module] } as CSSProperties}>
          <p className="next-when">
            {naechster.laeuft ? `Läuft jetzt, noch ${dauerText(naechster.minuten)}` : `Nächster Lernblock, in ${dauerText(naechster.minuten)}`}
          </p>
          <p className="next-title">
            {kurz(naechster.block.module)} {naechster.block.start_time} bis {props.today.find((b) => b.id === naechster.block.id)?.end}
          </p>
          <p className="next-sub">
            {[props.names[naechster.block.module], blockZahlen && `${blockZahlen.due} fällig, ${blockZahlen.fresh} neu`].filter(Boolean).join(', ')}
          </p>
          <button className="next-button" onClick={() => props.onStudyModule(naechster.block.module)}>
            {kurz(naechster.block.module)} lernen
          </button>
        </section>
      ) : (
        <button className="info-row" onClick={props.onOpenPlan}>
          <span>{props.today.length ? 'Heute kein Lernblock mehr' : 'Heute kein Lernblock geplant'}</span>
          <span className="info-hint">Plan öffnen</span>
        </button>
      )}

      <p className="summary">
        {nothing
          ? 'Für heute ist alles erledigt'
          : `Insgesamt ${plural(total.due, 'Wiederholung', 'Wiederholungen')} und ${plural(total.fresh, 'neue Karte', 'neue Karten')}`}
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
            const name = props.names[m.module]
            const exam = props.exams[m.module] ? formatExam(props.exams[m.module], props.now) : null
            return (
              <li key={m.module}>
                <button
                  className={`module ${empty ? 'is-empty' : ''} ${m.written ? 'is-written' : ''}`}
                  style={{ '--m': props.colors?.[m.module] } as CSSProperties}
                  onClick={() => props.onOpenModule(m.module)}
                >
                  <span className="module-label">
                    <span className="module-name">{kurz(m.module)}</span>
                    {name && <span className="module-sub">{name}</span>}
                    {exam && (
                      <span className={`module-exam ${m.written ? 'is-past' : dringlichkeit(props.exams[m.module], props.now)}`}>{exam}</span>
                    )}
                  </span>
                  <span className="module-counts">
                    <span className="count due">{m.due}<small>fällig</small></span>
                    <span className="count fresh">{m.fresh}<small>neu</small></span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <footer className="dock">
        <button className="primary big" disabled={nothing} onClick={() => props.onStudy()}>
          {nothing ? 'Nichts fällig' : 'Alles lernen'}
        </button>
      </footer>
    </main>
  )
}
