import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Store } from './lib/store'
import { DemoStore } from './lib/store-demo'
import { SupabaseStore } from './lib/store-supabase'
import { supabase } from './lib/supabase'
import { buildQueue, overview } from './lib/queue'
import { countIntroduced, remainingNew } from './lib/settings'
import type { ReviewRecord, StudyCard } from './lib/types'
import { Home } from './views/Home'
import { Login } from './views/Login'
import { Settings } from './views/Settings'
import { Study } from './views/Study'

type View = { name: 'home' } | { name: 'settings' } | { name: 'study'; queue: StudyCard[] }

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
  }, [store])

  useEffect(() => {
    setCards(null)
    void load()
  }, [load])

  // Zurück in die App geholt: Fälligkeiten neu berechnen und Warteliste senden
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible' && view.name === 'home') {
        setTick((t) => t + 1)
        void load()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load, view.name])

  // Jede Minute neu rechnen, damit Lernschritte von wenigen Minuten fällig werden
  useEffect(() => {
    if (view.name !== 'home') return
    const id = window.setInterval(() => setTick((t) => t + 1), 60_000)
    return () => window.clearInterval(id)
  }, [view.name])

  const now = useMemo(() => new Date(), [cards, view, tick])
  const ov = useMemo(
    () => (cards && store ? overview(cards, now, remainingNew(store.kind, now)) : null),
    [cards, now, store],
  )

  function onReview(r: ReviewRecord, wasNew: boolean) {
    if (wasNew && store) countIntroduced(store.kind)
    setCards((cs) => cs?.map((c) => (c.item.id === r.itemId ? { ...c, state: r.state } : c)) ?? cs)
    void store?.saveReview(r).then(() => setPending(store.pendingCount()))
  }

  function startStudy(module?: string) {
    if (!cards || !store) return
    const at = new Date()
    setView({
      name: 'study',
      queue: buildQueue(cards, { now: at, newLimit: remainingNew(store.kind, at), module }),
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
    body = <Study initial={view.queue} onReview={onReview} onExit={() => setView({ name: 'home' })} />
  } else {
    body = (
      <Home
        overview={ov}
        pending={pending}
        onStudy={startStudy}
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
