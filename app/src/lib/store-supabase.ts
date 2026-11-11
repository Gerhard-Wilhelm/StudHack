import type { SupabaseClient } from '@supabase/supabase-js'
import { folienPfade, idbAblage, vorladenFaellig, type Ablage } from './offline'
import { hhmm, isoDate, type NewBlock, type StudyBlock } from './plan'
import type { Store } from './store'
import type { CardStateFields, Item, ModuleInfo, Note, NoteSummary, ReviewRecord, StudyCard } from './types'

const PENDING_KEY = 'studhack.pending'
const CACHE_KEY = 'studhack.cards'
const PAGE = 1000
const NOTES_CACHE_KEY = 'studhack.notes'
const MODULES_CACHE_KEY = 'studhack.modules'
const BLOCKS_CACHE_KEY = 'studhack.blocks'
const VORLADEN_KEY = 'studhack.vorgeladen'
const SIGNED_URL_SECONDS = 3600
// Gemerkte Zeiträume des Lernplans, die neuesten zuerst
const BLOCKS_CACHE_MAX = 8
const BILDER_JE_ABFRAGE = 50

const STATE_COLUMNS =
  'item_id,due,stability,difficulty,elapsed_days,scheduled_days,learning_steps,reps,lapses,state,last_review'
const ITEM_COLUMNS = 'id,module,week,type,question,answer,options,eingaben,source_file,source_page'

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

  constructor(
    private sb: SupabaseClient,
    private ablage: Ablage = idbAblage,
  ) {}

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
    try {
      const { data, error } = await this.sb
        .from('notes')
        .select('id,module,week,title,body,source_file')
        .eq('id', id)
        .single()
      if (error) throw error
      await this.ablage.schreiben([data as Note]).catch(() => undefined)
      return data as Note
    } catch (e) {
      const gemerkt = await this.ablage.lesen(id).catch(() => undefined)
      if (gemerkt) return gemerkt
      throw e
    }
  }

  async vorladen(): Promise<void> {
    const heute = isoDate(new Date())
    if (!vorladenFaellig(localStorage.getItem(VORLADEN_KEY), heute)) return
    const { data, error } = await this.sb.from('notes').select('id,module,week,title,body,source_file')
    if (error) throw error
    await this.ablage.schreiben(data as Note[])
    localStorage.setItem(VORLADEN_KEY, heute)
  }

  async bilderVorladen(fortschritt: (fertig: number, gesamt: number) => void): Promise<number> {
    const notizen = await this.ablage.alle()
    const module = readJson<ModuleInfo[]>(MODULES_CACHE_KEY, [])
    const pfade = folienPfade([...notizen.map((n) => n.body), ...module.map((m) => m.body)])
    let fertig = 0
    fortschritt(0, pfade.length)
    for (let i = 0; i < pfade.length; i += BILDER_JE_ABFRAGE) {
      const urls = await this.resolveImages(pfade.slice(i, i + BILDER_JE_ABFRAGE))
      // Der Service Worker speichert jede geladene Folie. Vier gleichzeitig schonen die Verbindung.
      const liste = Object.values(urls)
      for (let j = 0; j < liste.length; j += 4) {
        await Promise.all(liste.slice(j, j + 4).map((u) => fetch(u).then((r) => r.blob()).catch(() => undefined)))
        fertig += liste.slice(j, j + 4).length
        fortschritt(fertig, pfade.length)
      }
    }
    return pfade.length
  }

  async loadDrafts(): Promise<Item[]> {
    const { data, error } = await this.sb
      .from('items')
      .select(ITEM_COLUMNS)
      .eq('status', 'entwurf')
      .order('module')
      .order('week')
      .order('id')
    if (error) throw error
    return data as Item[]
  }

  async decideDrafts(ids: number[], status: 'freigegeben' | 'verworfen'): Promise<void> {
    if (ids.length === 0) return
    const { error } = await this.sb.from('items').update({ status }).in('id', ids).eq('status', 'entwurf')
    if (error) throw error
  }

  async loadBlocks(from: string, to: string): Promise<StudyBlock[]> {
    const key = `${from}|${to}`
    const gemerkt = readJson<[string, StudyBlock[]][]>(BLOCKS_CACHE_KEY, [])
    try {
      const { data, error } = await this.sb
        .from('study_blocks')
        .select('id,module,day,start_time,duration_min,done')
        .gte('day', from)
        .lte('day', to)
        .order('day')
        .order('start_time')
      if (error) throw error
      const blocks = (data as StudyBlock[]).map((b) => ({ ...b, start_time: hhmm(b.start_time) }))
      writeJson(BLOCKS_CACHE_KEY, [[key, blocks], ...gemerkt.filter(([k]) => k !== key)].slice(0, BLOCKS_CACHE_MAX))
      return blocks
    } catch (e) {
      const treffer = gemerkt.find(([k]) => k === key)
      if (treffer) return treffer[1]
      throw e
    }
  }

  async saveBlock(block: NewBlock): Promise<StudyBlock> {
    const { id, ...fields } = block
    const query = id
      ? this.sb.from('study_blocks').update(fields).eq('id', id)
      : this.sb.from('study_blocks').insert(fields)
    const { data, error } = await query.select('id,module,day,start_time,duration_min,done').single()
    if (error) throw error
    const b = data as StudyBlock
    return { ...b, start_time: hhmm(b.start_time) }
  }

  async deleteBlock(id: number): Promise<void> {
    const { error } = await this.sb.from('study_blocks').delete().eq('id', id)
    if (error) throw error
  }

  async loadModules(): Promise<ModuleInfo[]> {
    try {
      const mit = await this.sb.from('modules').select('module,name,body,exam_date').order('module')
      // Migration 20261110120000_klausurtermine noch nicht eingespielt: ohne Termin weiter
      const { data, error } = mit.error ? await this.sb.from('modules').select('module,name,body').order('module') : mit
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
    const signiert = await this.sb.storage
      .from('folien')
      .createSignedUrls(paths.map((p) => `${uid}/${p}`), SIGNED_URL_SECONDS)
      .catch((e: unknown) => ({ data: null, error: e }))
    const { data, error } = signiert
    if (error || !data) {
      // Ohne Netz gibt es keine signierten Adressen. Die Adresse ohne Token liefert der Service Worker
      // aus dem Speicher, wenn die Folie schon einmal geladen wurde.
      const basis = import.meta.env.VITE_SUPABASE_URL as string | undefined
      if (!basis) throw error
      return Object.fromEntries(paths.map((p) => [p, `${basis}/storage/v1/object/sign/folien/${uid}/${p}`]))
    }
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
