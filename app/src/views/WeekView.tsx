import { useCallback, useEffect, useState } from 'react'
import { NoteBody } from '../components/NoteBody'
import type { Counts } from '../lib/queue'
import type { Store } from '../lib/store'
import type { Note, NoteSummary } from '../lib/types'

export function WeekView(props: {
  module: string
  week: number | null
  summary?: NoteSummary
  counts: Counts
  /** Restkontingent neuer Karten heute */
  newLimit: number
  store: Store
  onStudy: () => void
  onBack: () => void
}) {
  const { store, summary } = props
  const [note, setNote] = useState<Note | null>(null)
  const [error, setError] = useState<string | null>(null)
  const cards = props.counts.due + Math.min(props.counts.fresh, props.newLimit)

  useEffect(() => {
    setNote(null)
    setError(null)
    if (!summary) return
    let cancelled = false
    store
      .loadNote(summary.id)
      .then((n) => !cancelled && setNote(n))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      cancelled = true
    }
  }, [store, summary])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [summary])

  const resolveImages = useCallback((paths: string[]) => store.resolveImages(paths), [store])

  return (
    <main className="page week-view">
      <header className="bar">
        <button className="link" onClick={props.onBack}>{props.module}</button>
      </header>
      <h1 className="title note-title">
        <span className="note-week">{props.week ? `Woche ${props.week}` : 'Ohne Woche'}</span>
        {summary?.title ?? 'Noch keine Zusammenfassung'}
      </h1>

      {!summary && <p className="note">Für diese Woche gibt es keine Notiz. Die Karten kannst du trotzdem lernen.</p>}
      {summary && !note && !error && <p className="note">Lade Notiz</p>}
      {error && <p className="error" role="alert">Notiz konnte nicht geladen werden: {error}</p>}
      {note && <NoteBody text={note.body} resolveImages={resolveImages} />}

      <footer className="dock">
        <button className="primary big" disabled={cards === 0} onClick={props.onStudy}>
          {cards === 0 ? 'Keine Karten fällig' : `Karten dieser Woche lernen (${cards})`}
        </button>
      </footer>
    </main>
  )
}
