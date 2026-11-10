import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import {
  addDays, addMinutes, BLOCK_MIN, copyWeek, formatDay, hoursPerModule, isoDate, isoWeek, sortBlocks,
  suggestWeek, timeSlots, weekDays, weekStart, type NewBlock, type StudyBlock,
} from '../lib/plan'
import type { Store } from '../lib/store'

export interface PlanModule {
  module: string
  name?: string
  exam?: string | null
}

type Sheet = { block: NewBlock } | null

interface Press {
  timer: number
  x: number
  y: number
  block: StudyBlock
}

const LONG_PRESS_MS = 300

function stunden(h: number) {
  return `${String(h).replace('.', ',')} h`
}

export function Plan(props: {
  store: Store
  modules: PlanModule[]
  colors: Record<string, string>
  now: Date
  /** Montag der Woche, die zuerst gezeigt wird (Standard: diese Woche) */
  initialMonday?: string
  onStudy: (module: string) => void
  onBack: () => void
}) {
  const { store } = props
  const today = isoDate(props.now)
  const [monday, setMonday] = useState(props.initialMonday ?? weekStart(today))
  const [blocks, setBlocks] = useState<StudyBlock[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sheet, setSheet] = useState<Sheet>(null)
  const [drag, setDrag] = useState<{ block: StudyBlock; x: number; y: number; over: string | null } | null>(null)
  const press = useRef<Press | null>(null)
  const days = weekDays(monday)
  const sunday = days[6]

  const load = useCallback(async () => {
    setError(null)
    try {
      setBlocks(await store.loadBlocks(monday, sunday))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBlocks([])
    }
  }, [store, monday, sunday])

  useEffect(() => {
    setBlocks(null)
    void load()
  }, [load])

  async function save(block: NewBlock) {
    try {
      const saved = await store.saveBlock(block)
      setBlocks((bs) => sortBlocks([...(bs ?? []).filter((b) => b.id !== saved.id), saved]).filter((b) => b.day >= monday && b.day <= sunday))
    } catch (e) {
      setError(`Speichern fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  async function remove(id: number) {
    try {
      await store.deleteBlock(id)
      setBlocks((bs) => (bs ?? []).filter((b) => b.id !== id))
    } catch (e) {
      setError(`Löschen fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  async function saveMany(neu: NewBlock[]) {
    for (const b of neu) await save(b)
  }

  async function fromPreviousWeek() {
    const vorher = addDays(monday, -7)
    try {
      const alte = await store.loadBlocks(vorher, addDays(vorher, 6))
      if (!alte.length) {
        setError('In der Vorwoche ist nichts geplant.')
        return
      }
      await saveMany(copyWeek(alte, vorher, monday))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function suggest() {
    const exams = Object.fromEntries(props.modules.map((m) => [m.module, m.exam]))
    await saveMany(suggestWeek(monday, exams, 9, today))
  }

  // Verschieben: lange drücken, dann auf einen anderen Tag ziehen. Kurz tippen öffnet das Menü.
  function onDown(e: PointerEvent, block: StudyBlock) {
    const { clientX: x, clientY: y } = e
    const timer = window.setTimeout(() => {
      press.current = null
      navigator.vibrate?.(10)
      setDrag({ block, x, y, over: block.day })
    }, LONG_PRESS_MS)
    press.current = { timer, x, y, block }
  }

  // Während des Ziehens hört das ganze Fenster zu, nicht nur der Block unter dem Finger
  const dragging = drag !== null
  const dragRef = useRef(drag)
  dragRef.current = drag
  useEffect(() => {
    if (!dragging) return
    const move = (e: globalThis.PointerEvent) => {
      e.preventDefault()
      setDrag((d) => d && { ...d, x: e.clientX, y: e.clientY, over: dayAt(e.clientX, e.clientY) })
    }
    const up = (e: globalThis.PointerEvent) => {
      const d = dragRef.current
      const ziel = dayAt(e.clientX, e.clientY)
      if (d && ziel && ziel !== d.block.day) void save({ ...d.block, day: ziel })
      setDrag(null)
    }
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [dragging])

  function dayAt(x: number, y: number): string | null {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-day]')
    return el?.dataset.day ?? null
  }

  function onMove(e: PointerEvent) {
    const p = press.current
    if (!drag && p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 8) {
      window.clearTimeout(p.timer)
      press.current = null
    }
  }

  function onUp() {
    if (drag) return
    const p = press.current
    if (p) {
      window.clearTimeout(p.timer)
      press.current = null
      setSheet({ block: p.block })
    }
  }

  function onCancel() {
    if (press.current) window.clearTimeout(press.current.timer)
    press.current = null
  }

  const summe = hoursPerModule(blocks ?? [])
  const gesamt = summe.reduce((s, x) => s + x.hours, 0)

  return (
    <main className="page plan">
      <header className="bar">
        <button className="link" onClick={props.onBack}>Zurück</button>
        <button className="link" onClick={() => setMonday(weekStart(today))} disabled={monday === weekStart(today)}>
          Diese Woche
        </button>
      </header>

      <div className="week-nav">
        <button className="week-step" aria-label="Vorige Woche" onClick={() => setMonday(addDays(monday, -7))}>‹</button>
        <h1 className="title small">
          KW {isoWeek(monday)}
          <span className="week-range">{formatDay(monday)} bis {formatDay(sunday)}</span>
        </h1>
        <button className="week-step" aria-label="Nächste Woche" onClick={() => setMonday(addDays(monday, 7))}>›</button>
      </div>

      {error && <p className="error" role="alert">{error}</p>}

      <p className="plan-sum">
        {gesamt === 0 ? 'Noch nichts geplant.' : `Gesamt ${stunden(gesamt)}: `}
        {summe.map((s) => (
          <span key={s.module} className="sum-chip" style={{ '--m': props.colors[s.module] } as CSSProperties}>
            {s.module} {stunden(s.hours)}
          </span>
        ))}
      </p>

      {blocks !== null && blocks.length === 0 && (
        <div className="plan-actions">
          <button className="quiet" onClick={() => void suggest()}>Vorschlag für diese Woche</button>
          <button className="quiet" onClick={() => void fromPreviousWeek()}>Vorwoche übernehmen</button>
        </div>
      )}

      <ol className="days">
        {days.map((day) => {
          const tag = (blocks ?? []).filter((b) => b.day === day)
          return (
            <li
              key={day}
              data-day={day}
              className={`day ${day === today ? 'is-today' : ''} ${drag?.over === day ? 'is-target' : ''}`}
            >
              <div className="day-head">
                <span className="day-name">{formatDay(day)}</span>
                <button
                  className="day-add"
                  aria-label={`Block am ${formatDay(day)} hinzufügen`}
                  onClick={() => setSheet({ block: { module: props.modules[0]?.module ?? '', day, start_time: '18:00', duration_min: BLOCK_MIN, done: false } })}
                >
                  +
                </button>
              </div>
              <div className="day-blocks">
                {blocks === null ? null : tag.length === 0 ? (
                  <span className="day-free">frei</span>
                ) : (
                  tag.map((b) => (
                    <button
                      key={b.id}
                      className={`block ${b.done ? 'is-done' : ''} ${drag?.block.id === b.id ? 'is-dragging' : ''}`}
                      style={{ '--m': props.colors[b.module] ?? 'var(--ink)' } as CSSProperties}
                      onPointerDown={(e) => onDown(e, b)}
                      onPointerMove={onMove}
                      onPointerUp={onUp}
                      onPointerCancel={onCancel}
                      onContextMenu={(e) => e.preventDefault()}
                    >
                      <span className="block-module">{b.module}</span>
                      <span className="block-time">
                        {b.start_time} bis {addMinutes(b.start_time, b.duration_min)}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </li>
          )
        })}
      </ol>
      <p className="hint plan-hint">Tippen zum Bearbeiten, lange drücken und ziehen zum Verschieben.</p>

      {drag && (
        <div className="block block-ghost" style={{ left: drag.x, top: drag.y, '--m': props.colors[drag.block.module] } as CSSProperties}>
          <span className="block-module">{drag.block.module}</span>
        </div>
      )}

      {sheet && (
        <BlockSheet
          block={sheet.block}
          days={days}
          modules={props.modules}
          colors={props.colors}
          onClose={() => setSheet(null)}
          onSave={(b) => {
            setSheet(null)
            void save(b)
          }}
          onDelete={(id) => {
            setSheet(null)
            void remove(id)
          }}
          onStudy={(m) => {
            setSheet(null)
            props.onStudy(m)
          }}
        />
      )}
    </main>
  )
}

function BlockSheet(props: {
  block: NewBlock
  days: string[]
  modules: PlanModule[]
  colors: Record<string, string>
  onClose: () => void
  onSave: (b: NewBlock) => void
  onDelete: (id: number) => void
  onStudy: (module: string) => void
}) {
  const [b, setB] = useState<NewBlock>(props.block)
  const neu = props.block.id === undefined

  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <div className="sheet" role="dialog" aria-label={neu ? 'Block hinzufügen' : 'Block bearbeiten'} onClick={(e) => e.stopPropagation()}>
        <h2 className="sheet-title">{neu ? 'Block hinzufügen' : 'Block bearbeiten'}</h2>

        <p className="sheet-label">Modul</p>
        <div className="sheet-modules">
          {props.modules.map((m) => (
            <button
              key={m.module}
              className={`sheet-module ${b.module === m.module ? 'is-active' : ''}`}
              style={{ '--m': props.colors[m.module] } as CSSProperties}
              onClick={() => setB({ ...b, module: m.module })}
            >
              {m.module}
            </button>
          ))}
        </div>

        <p className="sheet-label">Tag</p>
        <div className="sheet-days">
          {props.days.map((d) => (
            <button key={d} className={`sheet-day ${b.day === d ? 'is-active' : ''}`} onClick={() => setB({ ...b, day: d })}>
              {formatDay(d).slice(0, 2)}
              <small>{formatDay(d).slice(3, 6)}</small>
            </button>
          ))}
        </div>

        <label className="sheet-label" htmlFor="block-start">Beginn (2 Stunden)</label>
        <select id="block-start" className="sheet-select" value={b.start_time} onChange={(e) => setB({ ...b, start_time: e.target.value })}>
          {timeSlots().map((t) => (
            <option key={t} value={t}>
              {t} bis {addMinutes(t, b.duration_min)}
            </option>
          ))}
        </select>

        {!neu && (
          <label className="toggle-line">
            <input type="checkbox" checked={b.done} onChange={() => setB({ ...b, done: !b.done })} />
            Erledigt
          </label>
        )}

        <div className="sheet-actions">
          {!neu && (
            <button className="quiet" onClick={() => props.onStudy(b.module)}>
              {b.module} jetzt lernen
            </button>
          )}
          <button className="primary" disabled={!b.module} onClick={() => props.onSave(b)}>
            Speichern
          </button>
          {!neu && (
            <button className="quiet danger" onClick={() => props.onDelete(b.id!)}>
              Löschen
            </button>
          )}
          <button className="link" onClick={props.onClose}>Abbrechen</button>
        </div>
      </div>
    </div>
  )
}
