import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Store } from './lib/store'
import { DemoStore } from './lib/store-demo'
import { SupabaseStore } from './lib/store-supabase'
import { supabase } from './lib/supabase'
import { dailyQuota, getReactivated, isWritten, setReactivated } from './lib/exams'
import { addMinutes, isoDate, moduleColors, sortBlocks, type StudyBlock } from './lib/plan'
import { buildQueue, newPerModule, overview, weekCounts } from './lib/queue'
import { countIntroduced, remainingNew } from './lib/settings'
import type { Item, ModuleInfo, NoteSummary, ReviewRecord, StudyCard } from './lib/types'
import { Drafts } from './views/Drafts'
import { Home } from './views/Home'
import { Login } from './views/Login'
import { ModuleInfoView } from './views/ModuleInfo'
import { ModuleView, type WeekRow } from './views/ModuleView'
import { Plan, type PlanModule } from './views/Plan'
import { Settings } from './views/Settings'
import { Study } from './views/Study'
import { WeekView } from './views/WeekView'

type View =
  | { name: 'home' }
  | { name: 'settings' }
  | { name: 'drafts' }
  | { name: 'plan' }
  | { name: 'module'; module: string }
  | { name: 'info'; module: string }
  | { name: 'week'; module: string; week: number | null }
  | { name: 'study'; queue: StudyCard[]; back: View }

const DEMO_FLAG = 'studhack.demoActive'

function demoActive() {
  try {
    return localStorage.getItem(DEMO_FLAG) === '1'
  } catch {
    return false
  }
}

function setDemoActive(on: boolean) {
  try {
    if (on) localStorage.setItem(DEMO_FLAG, '1')
    else localStorage.removeItem(DEMO_FLAG)
  } catch {
    // ohne Speicher gilt die Demo nur bis zum Neuladen
  }
}

export function App() {
  const [store, setStore] = useState<Store | null>(demoActive() ? new DemoStore() : null)
  const [authChecked, setAuthChecked] = useState(store !== null || !supabase)
  const [cards, setCards] = useState<StudyCard[] | null>(null)
  const [notes, setNotes] = useState<NoteSummary[]>([])
  const [notesError, setNotesError] = useState<string | null>(null)
  const [modules, setModules] = useState<ModuleInfo[]>([])
  const [drafts, setDrafts] = useState<Item[]>([])
  const [reactivated, setReactivatedState] = useState<string[]>(getReactivated)
  const [todayBlocks, setTodayBlocks] = useState<StudyBlock[]>([])
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>({ name: 'home' })
  const [pending, setPending] = useState(0)
  const [tick, setTick] = useState(0)

  // Supabase-Sitzung beobachten, solange die Demo nicht läuft
  useEffect(() => {
    if (!supabase || store?.kind === 'demo') return
    const sb = supabase
    const { data } = sb.auth.onAuthStateChange((_event, session) => {
      setStore((cur) => (cur?.kind === 'demo' ? cur : session ? (cur ?? new SupabaseStore(sb)) : null))
      setAuthChecked(true)
    })
    return () => data.subscription.unsubscribe()
  }, [store?.kind])

  const load = useCallback(async () => {
    if (!store) return
    setError(null)
    try {
      setCards(await store.loadCards())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setPending(store.pendingCount())
    try {
      setNotes(await store.loadNotes())
      setNotesError(null)
    } catch (e) {
      setNotesError(e instanceof Error ? e.message : String(e))
    }
    try {
      const heute = isoDate(new Date())
      setTodayBlocks(sortBlocks(await store.loadBlocks(heute, heute)))
    } catch {
      // ohne Tabelle study_blocks (Migration fehlt) gibt es einfach keinen Plan
      setTodayBlocks([])
    }
    try {
      setDrafts(await store.loadDrafts())
    } catch {
      setDrafts([])
    }
    try {
      setModules(await store.loadModules())
    } catch {
      // ohne Tabelle modules (Migration fehlt) zeigt die App einfach keine Modulinfos
      setModules([])
    }
  }, [store])

  useEffect(() => {
    setCards(null)
    void load()
  }, [load])

  // Zurück in die App geholt: Fälligkeiten neu berechnen und Warteliste senden
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible' && view.name !== 'study') {
        setTick((t) => t + 1)
        void load()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load, view.name])

  // Jede Minute neu rechnen, damit Lernschritte von wenigen Minuten fällig werden
  useEffect(() => {
    if (view.name === 'study') return
    const id = window.setInterval(() => setTick((t) => t + 1), 60_000)
    return () => window.clearInterval(id)
  }, [view.name])

  const now = useMemo(() => new Date(), [cards, view, tick])
  const newLimit = store ? remainingNew(store.kind, now) : 0

  // Klausurtermine: Module nach ihrer Klausur pausieren. Neue Karten an die Module mit Block heute, sonst nach Klausurnähe
  const exams = useMemo(
    () => Object.fromEntries(modules.filter((m) => m.exam_date).map((m) => [m.module, m.exam_date!])),
    [modules],
  )
  const written = useMemo(
    () => Object.keys(exams).filter((m) => isWritten(exams[m], now)).sort((a, b) => a.localeCompare(b, 'de')),
    [exams, now],
  )
  const paused = useMemo(() => new Set(written.filter((m) => !reactivated.includes(m))), [written, reactivated])
  const activeCards = useMemo(() => cards?.filter((c) => !paused.has(c.item.module)) ?? null, [cards, paused])
  const quota = useMemo(() => {
    if (!activeCards) return {}
    return dailyQuota(newPerModule(activeCards), exams, todayBlocks, newLimit, now)
  }, [activeCards, exams, todayBlocks, now, newLimit])

  const ov = useMemo(() => {
    if (!activeCards) return null
    const o = overview(activeCards, now, newLimit, quota)
    for (const m of o.modules) m.written = isWritten(exams[m.module], now)
    // Module, zu denen es nur Notizen oder eine Übersicht und noch keine Karten gibt, und pausierte
    const known = new Set(o.modules.map((m) => m.module))
    for (const module of [...notes.map((n) => n.module), ...modules.map((m) => m.module), ...paused]) {
      if (!known.has(module)) {
        known.add(module)
        o.modules.push({ module, due: 0, fresh: 0, written: isWritten(exams[module], now) })
      }
    }
    o.modules.sort((a, b) => a.module.localeCompare(b.module, 'de'))
    return o
  }, [activeCards, notes, modules, paused, exams, now, newLimit, quota])

  const moduleNames = useMemo(() => Object.fromEntries(modules.map((m) => [m.module, m.name])), [modules])

  // Module für den Lernplan, nach Klausurtermin sortiert (ohne Termin ans Ende)
  const planModules: PlanModule[] = useMemo(() => {
    const kuerzel = new Set([...modules.map((m) => m.module), ...(cards ?? []).map((c) => c.item.module)])
    return [...kuerzel]
      .map((m) => ({ module: m, name: moduleNames[m], exam: exams[m] ?? null }))
      .sort((a, b) => (a.exam ?? '9999').localeCompare(b.exam ?? '9999') || a.module.localeCompare(b.module, 'de'))
  }, [modules, cards, moduleNames, exams])
  const colors = useMemo(() => moduleColors(planModules.map((m) => m.module)), [planModules])

  function weekRows(module: string): WeekRow[] {
    const counts = cards ? weekCounts(cards, module, now) : new Map()
    const byWeek = new Map(notes.filter((n) => n.module === module).map((n) => [n.week, n]))
    const weeks = [...new Set([...counts.keys(), ...byWeek.keys()])].sort(
      (a, b) => (a ?? 99) - (b ?? 99),
    )
    return weeks.map((week) => ({
      week,
      note: byWeek.get(week),
      counts: counts.get(week) ?? { due: 0, fresh: 0 },
    }))
  }

  function onReview(r: ReviewRecord, wasNew: boolean) {
    if (wasNew && store) countIntroduced(store.kind)
    setCards((cs) => cs?.map((c) => (c.item.id === r.itemId ? { ...c, state: r.state } : c)) ?? cs)
    void store?.saveReview(r).then(() => setPending(store.pendingCount()))
  }

  function startStudy(filter: { module?: string; week?: number | null }, back: View) {
    if (!cards || !activeCards || !store) return
    const at = new Date()
    // Ein Modul gezielt geöffnet: auch pausierte abfragen. Sonst nur aktive, neue Karten nach Quote.
    const queue = filter.module
      ? buildQueue(cards, { now: at, newLimit: remainingNew(store.kind, at), ...filter })
      : buildQueue(activeCards, { now: at, newLimit: remainingNew(store.kind, at), newQuota: quota })
    setView({ name: 'study', queue, back })
  }

  function toggleReactivated(module: string) {
    const next = reactivated.includes(module) ? reactivated.filter((m) => m !== module) : [...reactivated, module]
    setReactivated(next)
    setReactivatedState(next)
  }

  async function logout() {
    if (store?.kind === 'demo') {
      setDemoActive(false)
      setStore(null)
    } else {
      await supabase?.auth.signOut()
    }
    setCards(null)
    setView({ name: 'home' })
  }

  const demoBand = store?.kind === 'demo' && <div className="demo-band">Demo</div>

  if (!authChecked) return <main className="page center"><p className="lead">Lade</p></main>

  if (!store) {
    return (
      <Login
        onDemo={() => {
          setDemoActive(true)
          setStore(new DemoStore())
        }}
      />
    )
  }

  let body
  if (view.name === 'settings') {
    body = (
      <Settings
        demo={store.kind === 'demo'}
        written={written.map((m) => ({ module: m, name: moduleNames[m], active: reactivated.includes(m) }))}
        onToggleWritten={toggleReactivated}
        onBack={() => setView({ name: 'home' })}
        onLogout={logout}
        onResetDemo={() => {
          DemoStore.reset()
          setStore(new DemoStore())
          setView({ name: 'home' })
        }}
      />
    )
  } else if (error && !cards) {
    body = (
      <main className="page center">
        <p className="error" role="alert">Karten konnten nicht geladen werden: {error}</p>
        <button className="primary" onClick={() => void load()}>Erneut laden</button>
        <button className="quiet" onClick={() => setView({ name: 'settings' })}>Einstellungen</button>
      </main>
    )
  } else if (!cards || !ov) {
    body = <main className="page center"><p className="lead">Lade Karten</p></main>
  } else if (view.name === 'study') {
    const back = view.back
    body = <Study initial={view.queue} onReview={onReview} onExit={() => setView(back)} />
  } else if (view.name === 'module') {
    body = (
      <ModuleView
        module={view.module}
        info={modules.find((m) => m.module === view.module)}
        now={now}
        weeks={weekRows(view.module)}
        newLimit={newLimit}
        notesError={notesError}
        onOpenWeek={(week) => setView({ name: 'week', module: view.module, week })}
        onOpenInfo={() => setView({ name: 'info', module: view.module })}
        onStudy={() => startStudy({ module: view.module }, view)}
        onBack={() => setView({ name: 'home' })}
      />
    )
  } else if (view.name === 'plan') {
    body = (
      <Plan
        store={store}
        modules={planModules.filter((m) => !paused.has(m.module))}
        colors={colors}
        now={now}
        onStudy={(module) => startStudy({ module }, { name: 'plan' })}
        onBack={() => {
          setView({ name: 'home' })
          void load()
        }}
      />
    )
  } else if (view.name === 'drafts') {
    body = (
      <Drafts
        drafts={drafts}
        names={moduleNames}
        onDecide={async (ids, status) => {
          await store.decideDrafts(ids, status)
          setDrafts((ds) => ds.filter((d) => !ids.includes(d.id)))
          // Freigegebene erscheinen erst nach dem Neuladen im Lernstapel
          if (status === 'freigegeben') void load()
        }}
        onBack={() => setView({ name: 'home' })}
      />
    )
  } else if (view.name === 'info') {
    const info = modules.find((m) => m.module === view.module)
    const back = { name: 'module', module: view.module } as const
    body = info ? (
      <ModuleInfoView info={info} store={store} onBack={() => setView(back)} />
    ) : (
      <main className="page center">
        <p className="note">Zu diesem Modul gibt es keine Übersicht.</p>
        <button className="quiet" onClick={() => setView(back)}>Zurück</button>
      </main>
    )
  } else if (view.name === 'week') {
    const row = weekRows(view.module).find((w) => w.week === view.week)
    body = (
      <WeekView
        module={view.module}
        week={view.week}
        summary={row?.note}
        counts={row?.counts ?? { due: 0, fresh: 0 }}
        newLimit={newLimit}
        store={store}
        onStudy={() => startStudy({ module: view.module, week: view.week }, view)}
        onBack={() => setView({ name: 'module', module: view.module })}
      />
    )
  } else {
    body = (
      <Home
        overview={ov}
        names={moduleNames}
        exams={exams}
        now={now}
        pending={pending}
        drafts={drafts.length}
        onOpenDrafts={() => setView({ name: 'drafts' })}
        today={todayBlocks.map((b) => ({ ...b, end: addMinutes(b.start_time, b.duration_min), color: colors[b.module] }))}
        onOpenPlan={() => setView({ name: 'plan' })}
        onStudyModule={(module) => startStudy({ module }, { name: 'home' })}
        onStudy={() => startStudy({}, { name: 'home' })}
        onOpenModule={(module) => setView({ name: 'module', module })}
        onSettings={() => setView({ name: 'settings' })}
      />
    )
  }

  return (
    <>
      {demoBand}
      {body}
    </>
  )
}
