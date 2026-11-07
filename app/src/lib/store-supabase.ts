import type { SupabaseClient } from '@supabase/supabase-js'
import type { Store } from './store'
import type { CardStateFields, Item, ModuleInfo, Note, NoteSummary, ReviewRecord, StudyCard } from './types'

const PENDING_KEY = 'studhack.pending'
const CACHE_KEY = 'studhack.cards'
const PAGE = 1000
const NOTES_CACHE_KEY = 'studhack.notes'
const MODULES_CACHE_KEY = 'studhack.modules'
const SIGNED_URL_SECONDS = 3600

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

  async loadNotes(): Promise<NoteSummary[]> {
    try {
      const { data, error } = await this.sb
        .from('notes')
        .select('id,module,week,title')
        .order('module')
        .order('week')
      if (error) throw error
      writeJson(NOTES_CACHE_KEY, data)
      return data as NoteSummary[]
    } catch (e) {
      const cached = readJson<NoteSummary[] | null>(NOTES_CACHE_KEY, null)
      if (cached) return cached
      throw e
    }
  }

  async loadNote(id: number): Promise<Note> {
    const { data, error } = await this.sb
      .from('notes')
      .select('id,module,week,title,body,source_file')
      .eq('id', id)
      .single()
    if (error) throw error
    return data as Note
  }

  async loadModules(): Promise<ModuleInfo[]> {
    try {
      const { data, error } = await this.sb.from('modules').select('module,name,body').order('module')
      if (error) throw error
      writeJson(MODULES_CACHE_KEY, data)
      return data as ModuleInfo[]
    } catch (e) {
      const cached = readJson<ModuleInfo[] | null>(MODULES_CACHE_KEY, null)
      if (cached) return cached
      throw e
    }
  }

  async resolveImages(paths: string[]): Promise<Record<string, string>> {
    const { data: auth } = await this.sb.auth.getSession()
    const uid = auth.session?.user.id
    if (!uid || paths.length === 0) return {}
    const { data, error } = await this.sb.storage
      .from('folien')
      .createSignedUrls(paths.map((p) => `${uid}/${p}`), SIGNED_URL_SECONDS)
    if (error) throw error
    const urls: Record<string, string> = {}
    for (const row of data) {
      if (row.signedUrl && row.path) urls[row.path.slice(uid.length + 1)] = row.signedUrl
    }
    return urls
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
