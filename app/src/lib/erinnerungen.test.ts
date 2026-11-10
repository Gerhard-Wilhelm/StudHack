// Tests für die Regeln der Edge Function erinnerungen (supabase/functions/erinnerungen/regeln.ts)
import { describe, expect, it } from 'vitest'
import { faelligeMitteilungen, kalenderwoche, naechsteWoche, ortszeit, type Lage } from '../../../supabase/functions/erinnerungen/regeln'

// Im November gilt in Berlin UTC+1: 17:00Z ist 18:00 deutsche Zeit
const um = (tag: string, zeit: string) => new Date(new Date(`${tag}T${zeit}:00Z`).getTime() - 3_600_000)

const lage = (teil: Partial<Lage> = {}): Lage => ({
  blocks: [],
  naechsteWocheGeplant: true,
  faellig: {},
  entwuerfe: { anzahl: 0, neuesteId: null },
  ...teil,
})

const block = { id: 7, module: 'BIL', day: '2026-11-10', start_time: '18:00:00', duration_min: 120, done: false }

describe('Mitteilungen', () => {
  it('rechnet in deutscher Zeit, auch über die Zeitumstellung', () => {
    expect(ortszeit(um('2026-11-10', '18:00'))).toEqual({ tag: '2026-11-10', min: 18 * 60, wochentag: 2 })
    expect(ortszeit(new Date('2026-07-01T16:00:00Z')).min).toBe(18 * 60)
    expect(naechsteWoche('2026-11-15', 0)).toEqual({ von: '2026-11-16', bis: '2026-11-22' })
    expect(naechsteWoche('2026-11-10', 2)).toEqual({ von: '2026-11-16', bis: '2026-11-22' })
    expect(kalenderwoche('2026-11-16')).toBe(47)
  })

  it('erinnert 10 Minuten vor dem Block, nicht früher und nicht nach Beginn', () => {
    const l = lage({ blocks: [block], faellig: { BIL: 14, MAK: 3 } })
    expect(faelligeMitteilungen(um('2026-11-10', '17:45'), l, new Set())).toEqual([])
    const [m] = faelligeMitteilungen(um('2026-11-10', '17:50'), l, new Set())
    expect(m).toMatchObject({ art: 'block', ref: '7', title: 'BIL ab 18:00', url: './?lernen=BIL' })
    expect(m.body).toBe('Lernblock bis 20:00. 14 Wiederholungen fällig.')
    expect(faelligeMitteilungen(um('2026-11-10', '18:00'), l, new Set())).toEqual([])
    expect(faelligeMitteilungen(um('2026-11-10', '17:55'), lage({ blocks: [{ ...block, done: true }] }), new Set())).toEqual([])
  })

  it('schickt nichts doppelt und beachtet die Schalter', () => {
    const l = lage({ blocks: [block] })
    expect(faelligeMitteilungen(um('2026-11-10', '17:55'), l, new Set(['block|7']))).toEqual([])
    expect(faelligeMitteilungen(um('2026-11-10', '17:55'), l, new Set(), { block: false })).toEqual([])
  })

  it('meldet abends offene Wiederholungen nur, wenn welche da sind', () => {
    expect(faelligeMitteilungen(um('2026-11-10', '20:30'), lage(), new Set())).toEqual([])
    const [m] = faelligeMitteilungen(um('2026-11-10', '20:35'), lage({ faellig: { BIL: 20, MAK: 3 } }), new Set())
    expect(m).toMatchObject({ art: 'abend', ref: '2026-11-10', url: './?lernen=alle' })
    expect(m.body).toBe('Noch 23 Wiederholungen fällig, etwa 8 Minuten.')
    expect(faelligeMitteilungen(um('2026-11-10', '22:05'), lage({ faellig: { BIL: 2 } }), new Set())).toEqual([])
  })

  it('erinnert sonntags an einen fehlenden Wochenplan', () => {
    const [m] = faelligeMitteilungen(um('2026-11-15', '18:00'), lage({ naechsteWocheGeplant: false }), new Set())
    expect(m).toMatchObject({ art: 'wochenplan', body: 'KW 47 ist noch nicht geplant. Ein Tipp öffnet den Plan mit Vorschlag.' })
    expect(faelligeMitteilungen(um('2026-11-15', '18:00'), lage(), new Set())).toEqual([])
    expect(faelligeMitteilungen(um('2026-11-14', '18:00'), lage({ naechsteWocheGeplant: false }), new Set())).toEqual([])
  })

  it('meldet neue Entwürfe außerhalb der Ruhezeit, je Ladung einmal', () => {
    const l = lage({ entwuerfe: { anzahl: 8, neuesteId: 512 } })
    expect(faelligeMitteilungen(um('2026-11-10', '23:00'), l, new Set())).toEqual([])
    expect(faelligeMitteilungen(um('2026-11-10', '06:55'), l, new Set())).toEqual([])
    const [m] = faelligeMitteilungen(um('2026-11-10', '07:00'), l, new Set())
    expect(m).toMatchObject({ art: 'entwuerfe', ref: '512', body: '8 Auswahlfragen warten auf Freigabe.' })
    expect(faelligeMitteilungen(um('2026-11-10', '12:00'), l, new Set(['entwuerfe|512']))).toEqual([])
  })

  it('schickt morgens einen Überblick, außer es gibt nichts', () => {
    const l = lage({ blocks: [block, { ...block, id: 8, module: 'MAK', start_time: '10:00:00' }], faellig: { BIL: 31 } })
    const [m] = faelligeMitteilungen(um('2026-11-10', '07:30'), l, new Set())
    expect(m).toMatchObject({ art: 'morgen', ref: '2026-11-10', body: 'Heute: MAK 10:00, BIL 18:00. 31 Wiederholungen fällig.' })
    expect(faelligeMitteilungen(um('2026-11-10', '07:25'), l, new Set())).toEqual([])
    expect(faelligeMitteilungen(um('2026-11-10', '07:30'), lage(), new Set())).toEqual([])
  })
})
