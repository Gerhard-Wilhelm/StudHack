import { useState } from 'react'
import { Markdown } from '../components/Markdown'
import { correctSet, isChoice } from '../lib/choice'
import { fehlerText } from '../lib/offline'
import { useKuerzel } from '../lib/kuerzel'
import type { Item } from '../lib/types'
import { zeigeZahl } from '../lib/zahlen'
import { TYPE_LABEL } from './Study'

type Decision = 'freigegeben' | 'verworfen'

function groupKey(d: Item) {
  return `${d.module}|${d.week ?? ''}`
}

export function Drafts(props: {
  drafts: Item[]
  names: Record<string, string>
  onDecide: (ids: number[], status: Decision) => Promise<void>
  onBack: () => void
}) {
  const kurz = useKuerzel()
  const [busy, setBusy] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const groups = new Map<string, Item[]>()
  for (const d of props.drafts) groups.set(groupKey(d), [...(groups.get(groupKey(d)) ?? []), d])

  async function decide(ids: number[], status: Decision) {
    setError(null)
    setBusy((b) => new Set([...b, ...ids]))
    try {
      await props.onDecide(ids, status)
    } catch (e) {
      setError(fehlerText(e))
    } finally {
      setBusy((b) => new Set([...b].filter((id) => !ids.includes(id))))
    }
  }

  return (
    <main className="page drafts">
      <header className="bar">
        <button className="link" onClick={props.onBack}>Zurück</button>
      </header>
      <h1 className="title">Entwürfe prüfen</h1>
      <p className="lead drafts-lead">
        {props.drafts.length === 0
          ? 'Alles geprüft. Neue Entwürfe erzeugt der Generator.'
          : 'Freigegebene Fragen kommen sofort in den Lernstapel. Prüf vor allem, ob die markierte Lösung stimmt.'}
      </p>
      {error && <p className="error" role="alert">Speichern fehlgeschlagen: {error}</p>}

      {[...groups.entries()].map(([key, items]) => {
        const { module, week } = items[0]
        const ids = items.map((d) => d.id)
        return (
          <section key={key} className="draft-group">
            <div className="draft-group-head">
              <h2>
                {kurz(module)}{week ? `, Woche ${week}` : ''}
                {props.names[module] && <span className="module-sub">{props.names[module]}</span>}
              </h2>
              <button className="link" disabled={ids.some((id) => busy.has(id))} onClick={() => decide(ids, 'freigegeben')}>
                Alle freigeben ({ids.length})
              </button>
            </div>

            {items.map((d) => {
              const correct = correctSet(d)
              return (
                <article key={d.id} className="draft">
                  <p className="draft-type">{TYPE_LABEL[d.type]}</p>
                  <Markdown className="draft-question" text={d.question} />
                  {isChoice(d) ? (
                    <ol className="draft-choices">
                      {d.options!.choices.map((c, i) => (
                        <li key={i} className={correct.includes(i) ? 'is-correct' : ''}>
                          <span className="draft-mark" aria-label={correct.includes(i) ? 'richtig' : 'falsch'}>
                            {correct.includes(i) ? 'richtig' : 'falsch'}
                          </span>
                          <Markdown text={c} />
                        </li>
                      ))}
                    </ol>
                  ) : d.eingaben?.length ? (
                    <ul className="draft-fields">
                      {d.eingaben.map((f, i) => (
                        <li key={i}>
                          <Markdown text={f.label} />
                          <span className="draft-value">
                            {zeigeZahl(f.wert, f.einheit)}
                            {f.toleranz > 0 && <small> ± {zeigeZahl(f.toleranz)}</small>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <Markdown className="draft-answer" text={d.answer} />
                  {d.source_file && (
                    <p className="source">
                      {d.source_file.replace(/\.pdf$/i, '')}
                      {d.source_page ? `, S. ${d.source_page}` : ''}
                    </p>
                  )}
                  <div className="draft-actions">
                    <button className="quiet" disabled={busy.has(d.id)} onClick={() => decide([d.id], 'verworfen')}>
                      Verwerfen
                    </button>
                    <button className="primary" disabled={busy.has(d.id)} onClick={() => decide([d.id], 'freigegeben')}>
                      Freigeben
                    </button>
                  </div>
                </article>
              )
            })}
          </section>
        )
      })}
    </main>
  )
}
