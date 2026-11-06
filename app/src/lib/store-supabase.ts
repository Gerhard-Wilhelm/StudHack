import type { SupabaseClient } from '@supabase/supabase-js'
import type { Store } from './store'
import type { CardStateFields, Item, ReviewRecord, StudyCard } from './types'

const PENDING_KEY = 'studhack.pending'
const CACHE_KEY = 'studhack.cards'
const PAGE = 1000

const STATE_COLUMNS =
  'item_id,due,stability,difficulty,elapsed_days,scheduled_days,learning_steps,reps,lapses,state,last_review'
const ITEM_COLUMNS = 'id,module,week,type,question,answer,options,source_file,source_page'

type Row = CardStateFields & { item_id: number; items: Item }

function readJson<T>(key: string, fallback: T): T {
  try {
    return (JSON.parse(localStorage.getItem(key) ?? 'null') as T) ?? fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Speicher voll oder gesperrt: dann eben ohne Zwischenspeicher
  }
}

export class SupabaseStore implements Store {
  kind = 'supabase' as const

  constructor(private sb: SupabaseClient) {}

  pendingCount(): number {
    return readJson<ReviewRecord[]>(PENDING_KEY, []).length
  }

  async loadCards(): Promise<StudyCard[]> {
    await this.flush()
    try {
      const cards: StudyCard[] = []
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await this.sb
          .from('card_states')
          .select(`${STATE_COLUMNS}, items!inner(${ITEM_COLUMNS})`)
          .eq('items.status', 'freigegeben')
          .order('item_id')
          .range(from, from + PAGE - 1)
        if (error) throw error
        for (const { item_id: _id, items, ...state } of data as unknown as Row[]) {
          cards.push({ item: items, state })
        }
        if (data.length < PAGE) break
      }
      writeJson(CACHE_KEY, cards)
      return cards
    } catch (e) {
      // Offline: letzter Stand plus noch nicht gespeicherte Bewertungen
      const cached = readJson<StudyCard[] | null>(CACHE_KEY, null)
      if (!cached) throw e
      const pending = readJson<ReviewRecord[]>(PENDING_KEY, [])
      const latest = new Map(pending.map((p) => [p.itemId, p.state]))
      return cached.map((c) => ({ ...c, state: latest.get(c.item.id) ?? c.state }))
    }
  }

  async saveReview(r: ReviewRecord): Promise<void> {
    const pending = readJson<ReviewRecord[]>(PENDING_KEY, [])
    pending.push(r)
    writeJson(PENDING_KEY, pending)
    await this.flush()
  }

  /** Schickt gemerkte Bewertungen der Reihe nach. Bricht beim ersten Fehler ab. */
  private flushing: Promise<void> | null = null

  private flush(): Promise<void> {
    this.flushing ??= this.doFlush().finally(() => (this.flushing = null))
    return this.flushing
  }

  private async doFlush() {
    for (;;) {
      const pending = readJson<ReviewRecord[]>(PENDING_KEY, [])
      const r = pending[0]
      if (!r) return
      try {
        await this.write(r)
      } catch {
        return
      }
      writeJson(PENDING_KEY, readJson<ReviewRecord[]>(PENDING_KEY, []).slice(1))
    }
  }

  private async write(r: ReviewRecord) {
    const up = await this.sb.from('card_states').update(r.state).eq('item_id', r.itemId)
    if (up.error) throw up.error
    const ins = await this.sb.from('reviews').insert({
      item_id: r.itemId,
      rating: r.rating,
      graded_by: 'selbst',
      duration_ms: r.durationMs,
      reviewed_at: r.reviewedAt,
    })
    if (ins.error) throw ins.error
  }
}
