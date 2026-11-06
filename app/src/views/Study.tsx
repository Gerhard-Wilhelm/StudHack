import { useEffect, useMemo, useRef, useState } from 'react'
import { Markdown } from '../components/Markdown'
import { RatingBar } from '../components/RatingBar'
import { preview, rate } from '../lib/fsrs'
import { advance } from '../lib/queue'
import type { Grade, ItemType, ReviewRecord, StudyCard } from '../lib/types'

const TYPE_LABEL: Record<ItemType, string> = {
  karteikarte: 'Karteikarte',
  verstaendnisfrage: 'Verständnisfrage',
  single_choice: 'Single Choice',
  rechenaufgabe: 'Rechenaufgabe',
}

export function Study(props: {
  initial: StudyCard[]
  onReview: (r: ReviewRecord, wasNew: boolean) => void
  onExit: () => void
}) {
  const [queue, setQueue] = useState(props.initial)
  const [revealed, setRevealed] = useState(false)
  const [picked, setPicked] = useState<number | null>(null)
  const [done, setDone] = useState(0)
  const shownAt = useRef(Date.now())
  const card = queue[0]
  const now = useMemo(() => new Date(), [card, revealed])
  const intervals = useMemo(() => (card ? preview(card.state, now) : null), [card, now])

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
    setPicked(null)
    setQueue((q) => advance(q, { item: card.item, state }, grade === 1))
  }

  // Tastatur für den Test am Rechner: Leertaste deckt auf, 1 bis 4 bewerten.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!card) return
      if (!revealed && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault()
        setRevealed(true)
      } else if (revealed && ['1', '2', '3', '4'].includes(e.key)) {
        onRate(Number(e.key) as Grade)
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
  const choices = item.type === 'single_choice' ? item.options?.choices : undefined

  return (
    <main className="page study">
      <header className="bar">
        <button className="link" onClick={props.onExit}>Beenden</button>
        <span className="remaining" aria-live="polite">noch {queue.length}</span>
      </header>

      <article
        className={`card ${revealed ? 'is-revealed' : ''}`}
        onClick={() => !revealed && !choices && setRevealed(true)}
      >
        <div className="card-head">
          <span>{item.module}{item.week ? `, Woche ${item.week}` : ''}</span>
          <span>{card.state.state === 0 ? 'neu' : TYPE_LABEL[item.type]}</span>
        </div>

        <Markdown className="question" text={item.question} />

        {choices && (
          <ol className="choices">
            {choices.map((c, i) => {
              const correct = revealed && i === item.options?.correct
              const wrong = revealed && picked === i && !correct
              return (
                <li key={i}>
                  <button
                    className={`choice ${correct ? 'correct' : ''} ${wrong ? 'wrong' : ''}`}
                    disabled={revealed}
                    onClick={() => {
                      setPicked(i)
                      setRevealed(true)
                    }}
                  >
                    <Markdown text={c} />
                  </button>
                </li>
              )
            })}
          </ol>
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

      <footer className="dock">
        {revealed && intervals ? (
          <RatingBar now={now} preview={intervals} onRate={onRate} />
        ) : (
          <button className="primary big" onClick={() => setRevealed(true)}>
            Lösung zeigen
          </button>
        )}
      </footer>
    </main>
  )
}
