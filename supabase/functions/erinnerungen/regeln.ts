// Regeln für die Mitteilungen: wann welche Mitteilung fällig ist und was drinsteht.
// Rein, ohne Zugriff auf Supabase oder Push, damit testbar (Tests in app/src/lib/erinnerungen.test.ts).

export type Art = 'block' | 'abend' | 'wochenplan' | 'entwuerfe' | 'morgen'

export const ARTEN: Art[] = ['block', 'morgen', 'abend', 'wochenplan', 'entwuerfe']

export type Prefs = Partial<Record<Art, boolean>>

export interface Block {
  id: number
  module: string
  /** YYYY-MM-DD */
  day: string
  /** HH:MM oder HH:MM:SS */
  start_time: string
  duration_min: number
  done: boolean
}

export interface Lage {
  /** Blöcke von heute (deutsche Zeit) */
  blocks: Block[]
  /** Gibt es in der nächsten Woche (Montag bis Sonntag) mindestens einen Block? */
  naechsteWocheGeplant: boolean
  /** Fällige Wiederholungen je Modul, ohne Module nach ihrer Klausur */
  faellig: Record<string, number>
  /** Offene Entwürfe vom Generator */
  entwuerfe: { anzahl: number; neuesteId: number | null }
}

export interface Mitteilung {
  art: Art
  /** Kennung gegen Doppelmeldungen, zusammen mit art */
  ref: string
  title: string
  body: string
  /** Ansicht, die ein Tipp öffnet, relativ zur App */
  url: string
}

export const ZEITZONE = 'Europe/Berlin'
export const BLOCK_VORLAUF_MIN = 10
export const MORGEN = '07:30'
export const ABEND = '20:30'
export const WOCHENPLAN = '18:00'
export const RUHE_BIS = '07:00'
export const RUHE_AB = '22:00'
// Ein verpasster Lauf (Zeitplan alle 5 Minuten) holt eine Mitteilung bis zu dieser Spanne nach
const NACHHOLEN_MIN = 90

function minuten(hhmm: string): number {
  const [h, m] = hhmm.slice(0, 5).split(':').map(Number)
  return h * 60 + m
}

function uhrzeit(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

/** Tag, Minute des Tages und Wochentag (0 Sonntag) in deutscher Zeit. */
export function ortszeit(jetzt: Date): { tag: string; min: number; wochentag: number } {
  const teile = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: ZEITZONE, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
    }).formatToParts(jetzt).map((p) => [p.type, p.value]),
  )
  const wochentag = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(teile.weekday)
  return { tag: `${teile.year}-${teile.month}-${teile.day}`, min: Number(teile.hour) * 60 + Number(teile.minute), wochentag }
}

/** Montag und Sonntag der Woche nach tag (YYYY-MM-DD). */
export function naechsteWoche(tag: string, wochentag: number): { von: string; bis: string } {
  const d = new Date(`${tag}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + (((8 - wochentag) % 7) || 7))
  const von = d.toISOString().slice(0, 10)
  d.setUTCDate(d.getUTCDate() + 6)
  return { von, bis: d.toISOString().slice(0, 10) }
}

/** ISO-Kalenderwoche eines Tages (YYYY-MM-DD). */
export function kalenderwoche(tag: string): number {
  const d = new Date(`${tag}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7))
  const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4))
  return 1 + Math.round(((d.getTime() - jan4.getTime()) / 86_400_000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7)
}

function zahl(n: number, eins: string, viele: string): string {
  return `${n} ${n === 1 ? eins : viele}`
}

function summe(r: Record<string, number>): number {
  return Object.values(r).reduce((s, n) => s + n, 0)
}

/** In [ab, ab + Spanne) und nicht über bis hinaus. */
function imFenster(min: number, ab: number, bis = ab + NACHHOLEN_MIN): boolean {
  return min >= ab && min < Math.min(bis, ab + NACHHOLEN_MIN)
}

/**
 * Alle Mitteilungen, die jetzt fällig sind und noch nicht verschickt wurden.
 * gesendet enthält "art|ref". Schalter, die aus sind, unterdrücken ihre Art.
 */
export function faelligeMitteilungen(jetzt: Date, lage: Lage, gesendet: Set<string>, prefs: Prefs = {}): Mitteilung[] {
  const { tag, min, wochentag } = ortszeit(jetzt)
  const ruhe = min < minuten(RUHE_BIS) || min >= minuten(RUHE_AB)
  const an = (art: Art) => prefs[art] !== false
  const offen = summe(lage.faellig)
  const out: Mitteilung[] = []

  // 1 Blockbeginn: 10 Minuten vorher bis zum Beginn, auch in der Ruhezeit
  if (an('block')) {
    for (const b of lage.blocks) {
      if (b.done || b.day !== tag) continue
      const start = minuten(b.start_time)
      if (!imFenster(min, start - BLOCK_VORLAUF_MIN, start)) continue
      const f = lage.faellig[b.module] ?? 0
      out.push({
        art: 'block',
        ref: String(b.id),
        title: `${b.module} ab ${uhrzeit(start)}`,
        body: `Lernblock bis ${uhrzeit(start + b.duration_min)}. ${f ? `${zahl(f, 'Wiederholung', 'Wiederholungen')} fällig.` : 'Keine Wiederholungen fällig, Zeit für neue Karten.'}`,
        url: `./?lernen=${encodeURIComponent(b.module)}`,
      })
    }
  }

  // 7 Morgenüberblick, nur wenn es etwas zu sagen gibt
  if (an('morgen') && imFenster(min, minuten(MORGEN), minuten(RUHE_AB))) {
    const heute = lage.blocks.filter((b) => b.day === tag && !b.done).sort((a, b) => a.start_time.localeCompare(b.start_time))
    if (heute.length || offen) {
      const plan = heute.length ? `Heute: ${heute.map((b) => `${b.module} ${uhrzeit(minuten(b.start_time))}`).join(', ')}.` : 'Heute ist kein Block geplant.'
      out.push({
        art: 'morgen',
        ref: tag,
        title: 'Guten Morgen',
        body: `${plan} ${offen ? `${zahl(offen, 'Wiederholung', 'Wiederholungen')} fällig.` : 'Keine Wiederholungen fällig.'}`,
        url: './',
      })
    }
  }

  // 2 Wiederholungen offen am Abend
  if (an('abend') && offen > 0 && imFenster(min, minuten(ABEND), minuten(RUHE_AB))) {
    out.push({
      art: 'abend',
      ref: tag,
      title: 'Wiederholungen offen',
      body: `Noch ${zahl(offen, 'Wiederholung', 'Wiederholungen')} fällig, etwa ${Math.max(1, Math.round(offen / 3))} Minuten.`,
      url: './?lernen=alle',
    })
  }

  // 3 Wochenplan fehlt, sonntags
  if (an('wochenplan') && wochentag === 0 && !lage.naechsteWocheGeplant && imFenster(min, minuten(WOCHENPLAN), minuten(RUHE_AB))) {
    const kw = kalenderwoche(naechsteWoche(tag, wochentag).von)
    out.push({
      art: 'wochenplan',
      ref: tag,
      title: 'Wochenplan fehlt',
      body: `KW ${kw} ist noch nicht geplant. Ein Tipp öffnet den Plan mit Vorschlag.`,
      url: './?ansicht=plan&woche=naechste',
    })
  }

  // 6 Neue Entwürfe, außerhalb der Ruhezeit, einmal je neuer Ladung
  if (an('entwuerfe') && !ruhe && lage.entwuerfe.anzahl > 0 && lage.entwuerfe.neuesteId !== null) {
    out.push({
      art: 'entwuerfe',
      ref: String(lage.entwuerfe.neuesteId),
      title: 'Neue Entwürfe',
      body: `${zahl(lage.entwuerfe.anzahl, 'neue Frage wartet', 'neue Fragen warten')} auf Freigabe.`,
      url: './?ansicht=entwuerfe',
    })
  }

  return out.filter((m) => !gesendet.has(`${m.art}|${m.ref}`))
}
