import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Markdown } from '../components/Markdown'
import { RatingBar } from '../components/RatingBar'
import { correctSet, evaluate, isChoice, shuffledOrder } from '../lib/choice'
import { preview, rate } from '../lib/fsrs'
import { advance } from '../lib/queue'
import type { Grade, ItemType, ReviewRecord, StudyCard } from '../lib/types'
import { pruefe, vorschlag, zeigeZahl } from '../lib/zahlen'

export const TYPE_LABEL: Record<ItemType, string> = {
  karteikarte: 'Karteikarte',
  verstaendnisfrage: 'Verständnisfrage',
  single_choice: 'Single Choice',
  multiple_choice: 'Mehrfachauswahl',
  rechenaufgabe: 'Rechenaufgabe',
}

export function Study(props: {
  initial: StudyCard[]
  /** Farben der Module aus dem Lernplan */
  colors?: Record<string, string>
  onReview: (r: ReviewRecord, wasNew: boolean) => void
  onExit: () => void
}) {
  const [queue, setQueue] = useState(props.initial)
  const [revealed, setRevealed] = useState(false)
  const [selected, setSelected] = useState<number[]>([])
  const [werte, setWerte] = useState<string[]>([])
  const [done, setDone] = useState(0)
  const shownAt = useRef(Date.now())
  const card = queue[0]
  // Fortschritt nach Karten, nicht nach Durchgängen: Eine Karte nach "Nochmal" zählt nicht doppelt
  const gesamt = useMemo(() => new Set(props.initial.map((c) => c.item.id)).size, [props.initial])
  const fertig = gesamt - new Set(queue.map((c) => c.item.id)).size
  const now = useMemo(() => new Date(), [card, revealed])
  const intervals = useMemo(() => (card ? preview(card.state, now) : null), [card, now])

  const choice = card ? isChoice(card.item) : false
  const multi = card?.item.type === 'multiple_choice'
  const choices = card?.item.options?.choices ?? []
  // Neu gemischt bei jeder Vorlage, auch wenn eine Karte nach "Nochmal" wiederkommt
  const order = useMemo(() => shuffledOrder(choices.length), [card])
  const result = choice && revealed ? evaluate(selected, correctSet(card!.item), choices.length) : null
  const felder = card?.item.type === 'rechenaufgabe' ? card.item.eingaben ?? [] : []
  const rechen = felder.length > 0
  const status = rechen && revealed ? felder.map((f, i) => pruefe(werte[i] ?? '', f)) : null
  const suggested: Grade | undefined = result ? (result.ok ? 3 : 1) : status ? vorschlag(status) : undefined

  useEffect(() => {
    shownAt.current = Date.now()
    window.scrollTo(0, 0)
  }, [card])

  function onRate(grade: Grade) {
    if (!card) return
    const at = new Date()
    const state = rate(card.state, grade, at)
    props.onReview(
      {
        itemId: card.item.id,
        state,
        rating: grade,
        durationMs: Math.max(0, at.getTime() - shownAt.current),
        reviewedAt: at.toISOString(),
      },
      card.state.state === 0,
    )
    setDone((d) => d + 1)
    setRevealed(false)
    setSelected([])
    setWerte([])
    setQueue((q) => advance(q, { item: card.item, state }, grade === 1))
  }

  function pick(i: number) {
    if (revealed) return
    if (multi) {
      setSelected((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]))
    } else {
      // Single Choice: ein Tipp wählt und prüft sofort
      setSelected([i])
      setRevealed(true)
    }
  }

  // Tastatur für den Test am Rechner: Leertaste deckt auf oder prüft, 1 bis 4 wählen bzw. bewerten.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!card) return
      // Beim Tippen in ein Eingabefeld zählen Leertaste und Ziffern nicht als Befehl
      if (e.target instanceof HTMLInputElement && e.key !== 'Enter') return
      if (!revealed && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault()
        setRevealed(true)
      } else if (['1', '2', '3', '4'].includes(e.key)) {
        const n = Number(e.key)
        if (revealed) onRate(n as Grade)
        else if (choice && n <= order.length) pick(order[n - 1])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!card) {
    return (
      <main className="page finished">
        <h1 className="title">Geschafft</h1>
        <p className="summary">
          {done === 1 ? 'Eine Karte' : `${done} Karten`} abgefragt. Die nächsten Wiederholungen
          stehen auf der Startseite.
        </p>
        <footer className="dock">
          <button className="primary big" onClick={props.onExit}>Zur Startseite</button>
        </footer>
      </main>
    )
  }

  const { item } = card
  const farbe = { '--m': props.colors?.[item.module] } as CSSProperties

  return (
    <main className="page study" style={farbe}>
      <header className="bar">
        <button className="link" onClick={props.onExit}>Beenden</button>
        <span className="remaining" aria-live="polite">{fertig} von {gesamt}</span>
      </header>
      <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={gesamt} aria-valuenow={fertig}>
        <span style={{ width: `${gesamt ? (fertig / gesamt) * 100 : 0}%` }} />
      </div>

      <article
        className={`card ${revealed ? 'is-revealed' : ''}`}
        onClick={() => !revealed && !choice && !rechen && setRevealed(true)}
      >
        <div className="card-head">
          <span>{item.module}{item.week ? `, Woche ${item.week}` : ''}</span>
          <span>{card.state.state === 0 ? 'neu' : TYPE_LABEL[item.type]}</span>
        </div>

        <Markdown className="question" text={item.question} />

        {choice && (
          <>
            {multi && !revealed && <p className="choice-hint">Mehrere Antworten möglich</p>}
            <ol className="choices">
              {order.map((i) => {
                const raw = result?.marks[i] ?? ''
                // "übersehen" gibt es nur bei Mehrfachauswahl, bei Single Choice ist die Lösung einfach grün
                const mark = !multi && raw === 'missed' ? 'correct' : raw
                const isSel = selected.includes(i)
                return (
                  <li key={i}>
                    <button
                      className={`choice ${mark} ${isSel ? (revealed ? 'chosen' : 'selected') : ''}`}
                      aria-pressed={multi ? isSel : undefined}
                      disabled={revealed}
                      onClick={() => pick(i)}
                    >
                      {multi && <span className="checkbox" aria-hidden="true" />}
                      <Markdown text={choices[i]} />
                      {mark === 'missed' && <span className="choice-note">übersehen</span>}
                    </button>
                  </li>
                )
              })}
            </ol>
            {result && (
              <p className={`verdict ${result.ok ? 'ok' : 'bad'}`} role="status">
                {result.ok ? 'Richtig.' : selected.length ? 'Nicht ganz.' : 'Ohne Antwort aufgedeckt.'}
              </p>
            )}
          </>
        )}

        {rechen && (
          <>
            <ol className="fields">
              {felder.map((f, i) => {
                const st = status?.[i]
                const id = `feld-${item.id}-${i}`
                return (
                  <li key={i} className={`field ${st ?? ''}`}>
                    <label htmlFor={id}><Markdown text={f.label} /></label>
                    <div className="field-row">
                      <button
                        type="button"
                        className="sign"
                        aria-label="Vorzeichen wechseln"
                        disabled={revealed}
                        onClick={() => setWerte((w) => {
                          const n = [...w]
                          const v = (n[i] ?? '').trim()
                          n[i] = v.startsWith('-') ? v.slice(1) : `-${v}`
                          return n
                        })}
                      >
                        ±
                      </button>
                      <input
                        id={id}
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        enterKeyHint={i === felder.length - 1 ? 'done' : 'next'}
                        value={werte[i] ?? ''}
                        disabled={revealed}
                        onChange={(e) => {
                          const v = e.target.value
                          setWerte((w) => {
                            const n = [...w]
                            n[i] = v
                            return n
                          })
                        }}
                      />
                      {f.einheit && <span className="unit">{f.einheit}</span>}
                    </div>
                    {st && st !== 'richtig' && (
                      <p className="field-note">
                        {st === 'ungueltig' ? 'Keine Zahl erkannt. ' : st === 'leer' ? '' : 'Falsch. '}
                        Lösung: {zeigeZahl(f.wert, f.einheit)}
                      </p>
                    )}
                  </li>
                )
              })}
            </ol>
            {status && status.some((x) => x !== 'leer') && (
              <p className={`verdict ${status.every((x) => x === 'richtig') ? 'ok' : 'bad'}`} role="status">
                {status.every((x) => x === 'richtig')
                  ? 'Richtig.'
                  : `${status.filter((x) => x === 'richtig').length} von ${status.length} richtig.`}
              </p>
            )}
          </>
        )}

        {revealed && (
          <div className="answer">
            <Markdown text={item.answer} />
            {item.source_file && (
              <p className="source">
                {item.source_file.replace(/\.pdf$/i, '')}
                {item.source_page ? `, S. ${item.source_page}` : ''}
              </p>
            )}
          </div>
        )}
      </article>
      {!revealed && !choice && !rechen && <p className="tap-hint">Tippen zum Aufdecken</p>}

      <footer className="dock">
        {revealed && intervals ? (
          <RatingBar now={now} preview={intervals} onRate={onRate} suggested={suggested} />
        ) : (multi && selected.length > 0) || (rechen && werte.some((w) => w?.trim())) ? (
          <button className="primary big" onClick={() => setRevealed(true)}>Prüfen</button>
        ) : (
          <button className="primary big" onClick={() => setRevealed(true)}>
            {choice ? 'Weiß ich nicht' : 'Lösung zeigen'}
          </button>
        )}
      </footer>
    </main>
  )
}
