import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Store } from './lib/store'
import { DemoStore } from './lib/store-demo'
import { SupabaseStore } from './lib/store-supabase'
import { supabase } from './lib/supabase'
import { buildQueue, overview, weekCounts } from './lib/queue'
import { countIntroduced, remainingNew } from './lib/settings'
import type { NoteSummary, ReviewRecord, StudyCard } from './lib/types'
import { Home } from './views/Home'
import { Login } from './views/Login'
import { ModuleView, type WeekRow } from './views/ModuleView'
import { Settings } from './views/Settings'
import { Study } from './views/Study'
import { WeekView } from './views/WeekView'

type View =
  | { name: 'home' }
  | { name: 'settings' }
  | { name: 'module'; module: string }
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
  const ov = useMemo(() => {
    if (!cards) return null
    const o = overview(cards, now, newLimit)
    // Module, zu denen es nur Notizen und noch keine Karten gibt
    const known = new Set(o.modules.map((m) => m.module))
    for (const n of notes) {
      if (!known.has(n.module)) {
        known.add(n.module)
        o.modules.push({ module: n.module, due: 0, fresh: 0 })
      }
    }
    o.modules.sort((a, b) => a.module.localeCompare(b.module, 'de'))
    return o
  }, [cards, notes, now, newLimit])

  function weekRows(module: string): WeekRow[] {
    const counts = cards ? weekCounts(cards, module, now, newLimit) : new Map()
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
    if (!cards || !store) return
    const at = new Date()
    setView({
      name: 'study',
      queue: buildQueue(cards, { now: at, newLimit: remainingNew(store.kind, at), ...filter }),
      back,
    })
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
        weeks={weekRows(view.module)}
        notesError={notesError}
        onOpenWeek={(week) => setView({ name: 'week', module: view.module, week })}
        onStudy={() => startStudy({ module: view.module }, view)}
        onBack={() => setView({ name: 'home' })}
      />
    )
  } else if (view.name === 'week') {
    const row = weekRows(view.module).find((w) => w.week === view.week)
    body = (
      <WeekView
        module={view.module}
        week={view.week}
        summary={row?.note}
        counts={row?.counts ?? { due: 0, fresh: 0 }}
        store={store}
        onStudy={() => startStudy({ module: view.module, week: view.week }, view)}
        onBack={() => setView({ name: 'module', module: view.module })}
      />
    )
  } else {
    body = (
      <Home
        overview={ov}
        pending={pending}
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
