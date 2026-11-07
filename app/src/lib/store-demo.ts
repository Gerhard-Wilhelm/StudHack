import { DEMO_ITEMS } from './demo-cards'
import { DEMO_NOTES } from './demo-notes'
import { resetIntroduced } from './settings'
import type { Store } from './store'
import type { CardStateFields, Note, NoteSummary, ReviewRecord, StudyCard } from './types'

const KEY = 'studhack.demo'

function emptyState(): CardStateFields {
  return {
    due: new Date().toISOString(), stability: 0, difficulty: 0, elapsed_days: 0,
    scheduled_days: 0, learning_steps: 0, reps: 0, lapses: 0, state: 0, last_review: null,
  }
}

function readStates(): Record<number, CardStateFields> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<number, CardStateFields>
  } catch {
    return {}
  }
}

/** Demo ohne Supabase. Der Lernstand liegt nur in diesem Browser. */
export class DemoStore implements Store {
  kind = 'demo' as const
  private states = readStates()

  async loadCards(): Promise<StudyCard[]> {
    return DEMO_ITEMS.map((item) => ({ item, state: this.states[item.id] ?? emptyState() }))
  }

  async saveReview(r: ReviewRecord): Promise<void> {
    this.states[r.itemId] = r.state
    try {
      localStorage.setItem(KEY, JSON.stringify(this.states))
    } catch {
      // Demo läuft dann nur bis zum Neuladen
    }
  }

  pendingCount(): number {
    return 0
  }

  async loadNotes(): Promise<NoteSummary[]> {
    return DEMO_NOTES.map(({ id, module, week, title }) => ({ id, module, week, title }))
  }

  async loadNote(id: number): Promise<Note> {
    const note = DEMO_NOTES.find((n) => n.id === id)
    if (!note) throw new Error(`Demo-Notiz ${id} gibt es nicht.`)
    return note
  }

  async resolveImages(paths: string[]): Promise<Record<string, string>> {
    // Demo-Bilder liegen in public/demo/
    return Object.fromEntries(paths.map((p) => [p, `demo/${p.split('/').pop()}`]))
  }

  static reset() {
    resetIntroduced('demo')
    try {
      localStorage.removeItem(KEY)
    } catch {
      // nichts zu tun
    }
  }
}
