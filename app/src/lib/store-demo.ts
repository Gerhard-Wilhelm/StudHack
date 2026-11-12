import { DEMO_DRAFTS, DEMO_ITEMS } from './demo-cards'
import { DEMO_MODULES, DEMO_NOTES } from './demo-notes'
import { resetIntroduced } from './settings'
import { sortBlocks, type NewBlock, type StudyBlock } from './plan'
import type { Store } from './store'
import type { CardStateFields, Item, ModuleInfo, Note, NoteSummary, ReviewRecord, StudyCard } from './types'

const KEY = 'studhack.demo'
const DRAFTS_KEY = 'studhack.demoDrafts'
const BLOCKS_KEY = 'studhack.demoBlocks'
const COLORS_KEY = 'studhack.demoFarben'

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

function readDecisions(): Record<number, 'freigegeben' | 'verworfen'> {
  try {
    return JSON.parse(localStorage.getItem(DRAFTS_KEY) ?? '{}') as Record<number, 'freigegeben' | 'verworfen'>
  } catch {
    return {}
  }
}

/** Demo ohne Supabase. Der Lernstand liegt nur in diesem Browser. */
export class DemoStore implements Store {
  kind = 'demo' as const
  private states = readStates()
  private decisions = readDecisions()

  async loadCards(): Promise<StudyCard[]> {
    const approved = DEMO_DRAFTS.filter((d) => this.decisions[d.id] === 'freigegeben')
    return [...DEMO_ITEMS, ...approved].map((item) => ({ item, state: this.states[item.id] ?? emptyState() }))
  }

  async loadDrafts(): Promise<Item[]> {
    return DEMO_DRAFTS.filter((d) => !this.decisions[d.id])
  }

  async decideDrafts(ids: number[], status: 'freigegeben' | 'verworfen'): Promise<void> {
    for (const id of ids) this.decisions[id] = status
    try {
      localStorage.setItem(DRAFTS_KEY, JSON.stringify(this.decisions))
    } catch {
      // Demo läuft dann nur bis zum Neuladen
    }
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

  private blocks(): StudyBlock[] {
    try {
      return JSON.parse(localStorage.getItem(BLOCKS_KEY) ?? '[]') as StudyBlock[]
    } catch {
      return []
    }
  }

  private writeBlocks(blocks: StudyBlock[]) {
    try {
      localStorage.setItem(BLOCKS_KEY, JSON.stringify(blocks))
    } catch {
      // Demo läuft dann nur bis zum Neuladen
    }
  }

  async loadBlocks(from: string, to: string): Promise<StudyBlock[]> {
    return sortBlocks(this.blocks().filter((b) => b.day >= from && b.day <= to))
  }

  async saveBlock(block: NewBlock): Promise<StudyBlock> {
    const all = this.blocks()
    const saved: StudyBlock = { ...block, id: block.id ?? Math.max(0, ...all.map((b) => b.id)) + 1 }
    this.writeBlocks([...all.filter((b) => b.id !== saved.id), saved])
    return saved
  }

  async deleteBlock(id: number): Promise<void> {
    this.writeBlocks(this.blocks().filter((b) => b.id !== id))
  }

  async loadColors(): Promise<Record<string, string>> {
    try {
      return JSON.parse(localStorage.getItem(COLORS_KEY) ?? '{}') as Record<string, string>
    } catch {
      return {}
    }
  }

  async saveColor(module: string, color: string | null): Promise<void> {
    const farben = await this.loadColors()
    if (color) farben[module] = color
    else delete farben[module]
    try {
      localStorage.setItem(COLORS_KEY, JSON.stringify(farben))
    } catch {
      // Demo läuft dann nur bis zum Neuladen
    }
  }

  async loadModules(): Promise<ModuleInfo[]> {
    // Kopien wie bei Supabase, sonst erkennt React Änderungen nicht
    return DEMO_MODULES.map((m) => ({ ...m }))
  }

  async resolveImages(paths: string[]): Promise<Record<string, string>> {
    // Demo-Bilder liegen in public/demo/
    return Object.fromEntries(paths.map((p) => [p, `demo/${p.split('/').pop()}`]))
  }

  static reset() {
    resetIntroduced('demo')
    try {
      localStorage.removeItem(DRAFTS_KEY)
      localStorage.removeItem(BLOCKS_KEY)
      localStorage.removeItem(COLORS_KEY)
      localStorage.removeItem(KEY)
    } catch {
      // nichts zu tun
    }
  }
}
