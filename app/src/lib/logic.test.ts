import { describe, expect, it } from 'vitest'
import { correctSet, evaluate, isChoice, shuffledOrder } from './choice'
import { allocateNew, daysUntil, formatDate, formatExam, isWritten, urgency } from './exams'
import { formatInterval, fromCard, rate, toCard } from './fsrs'
import { advance, buildQueue, overview, weekCounts } from './queue'
import { renderMarkdown, replaceObsidianLinks } from './render'
import type { CardStateFields, Item, StudyCard } from './types'

const now = new Date('2026-11-06T10:00:00Z')

function state(over: Partial<CardStateFields> = {}): CardStateFields {
  return {
    due: now.toISOString(), stability: 0, difficulty: 0, elapsed_days: 0, scheduled_days: 0,
    learning_steps: 0, reps: 0, lapses: 0, state: 0, last_review: null, ...over,
  }
}

function card(id: number, module: string, week: number | null, s: Partial<CardStateFields> = {}): StudyCard {
  const item: Item = {
    id, module, week, type: 'karteikarte', question: 'F', answer: 'A',
    options: null, source_file: null, source_page: null,
  }
  return { item, state: state(s) }
}

describe('Warteschlange', () => {
  const cards = [
    card(1, 'A', 3),
    card(2, 'A', 1),
    card(3, 'B', 2, { state: 2, due: '2026-11-05T00:00:00Z' }),
    card(4, 'B', 1, { state: 2, due: '2026-11-04T00:00:00Z' }),
    card(5, 'B', 1, { state: 2, due: '2026-11-20T00:00:00Z' }),
    card(6, 'A', null),
  ]

  it('nimmt erst fällige nach Fälligkeit, dann neue nach Woche', () => {
    expect(buildQueue(cards, { now, newLimit: 10 }).map((c) => c.item.id)).toEqual([4, 3, 2, 1, 6])
  })

  it('beachtet das Limit für neue Karten und den Modulfilter', () => {
    expect(buildQueue(cards, { now, newLimit: 1 }).map((c) => c.item.id)).toEqual([4, 3, 2])
    expect(buildQueue(cards, { now, newLimit: 10, module: 'B' }).map((c) => c.item.id)).toEqual([4, 3])
  })

  it('hängt Nochmal ans Ende, sonst fällt die Karte weg', () => {
    const q = buildQueue(cards, { now, newLimit: 10 })
    expect(advance(q, q[0], true).map((c) => c.item.id)).toEqual([3, 2, 1, 6, 4])
    expect(advance(q, q[0], false).map((c) => c.item.id)).toEqual([3, 2, 1, 6])
  })

  it('filtert nach Woche und zählt je Woche', () => {
    expect(buildQueue(cards, { now, newLimit: 10, module: 'A', week: 3 }).map((c) => c.item.id)).toEqual([1])
    expect(buildQueue(cards, { now, newLimit: 10, module: 'A', week: null }).map((c) => c.item.id)).toEqual([6])
    const wc = weekCounts(cards, 'B', now, 10)
    expect(wc.get(1)).toEqual({ due: 1, fresh: 0 })
    expect(wc.get(2)).toEqual({ due: 1, fresh: 0 })
  })

  it('zählt gesamt und pro Modul', () => {
    const ov = overview(cards, now, 2)
    expect(ov.total).toEqual({ due: 2, fresh: 2 })
    expect(ov.modules).toEqual([
      { module: 'A', due: 0, fresh: 2 },
      { module: 'B', due: 2, fresh: 0 },
    ])
  })
})

describe('FSRS', () => {
  it('rechnet DB-Zeile und Card verlustfrei um', () => {
    const s = state({ state: 2, stability: 4.2, difficulty: 5.1, reps: 3, last_review: '2026-11-01T10:00:00.000Z' })
    expect(fromCard(toCard(s), s, now)).toEqual({ ...s, elapsed_days: 5 })
  })

  it('setzt eine neue Karte nach Bewertung in den Lernzustand', () => {
    const next = rate(state(), 3, now)
    expect(next.state).toBe(1)
    expect(next.reps).toBe(1)
    expect(next.last_review).toBe(now.toISOString())
  })

  it('formatiert Intervalle', () => {
    const t = (ms: number) => formatInterval(now, new Date(now.getTime() + ms))
    expect(t(60_000)).toBe('1 Min')
    expect(t(3 * 3_600_000)).toBe('3 Std')
    expect(t(4 * 86_400_000)).toBe('4 T')
    expect(t(60 * 86_400_000)).toBe('2 Mon')
    expect(t(365 * 86_400_000)).toBe('1 J')
  })
})

describe('Darstellung', () => {
  it('ersetzt Obsidian-Links durch ihren Text', () => {
    expect(replaceObsidianLinks('Siehe [[BA02.pdf#page=7|BA02 S. 7]].')).toBe('Siehe BA02 S. 7.')
    expect(replaceObsidianLinks('[[BA02.pdf#page=7]] und ![[Bild.png]]')).toBe('BA02 und Bild.png')
  })

  it('rendert LaTeX und lässt Unterstriche in Formeln heil', () => {
    const html = renderMarkdown('Mit $x_1 * x_2$ und\n$$\\sum_{i=1}^n a_i$$')
    expect(html).toContain('class="katex"')
    expect(html).toContain('katex-display')
    expect(html).not.toContain('<em>')
  })

  it('lässt Geldbeträge mit Dollarzeichen in Ruhe', () => {
    expect(renderMarkdown('Kostet 5 $ und 10 $.')).not.toContain('katex')
  })

  it('zeigt rohes HTML als Text', () => {
    expect(renderMarkdown('<script>alert(1)</script>')).not.toContain('<script>')
  })
})

describe('Lesemodus', () => {
  it('klappt Lösungs-Callouts ein und rendert Formeln darin', () => {
    const html = renderMarkdown('**1. Frage?**\n\n> [!question]- Lösung\n> Weil $x_1$ wächst.\n> Zweite Zeile.\n\nDanach.')
    expect(html).toMatch(/<details class="callout callout-question"><summary>Lösung<\/summary>/)
    expect(html).toContain('class="katex"')
    expect(html).toContain('Zweite Zeile')
    expect(html).toMatch(/<\/details>[\s\S]*Danach/)
    expect(html).not.toContain('BLOCKPLACEHOLDER')
  })

  it('macht aus Mermaid einen Platzhalter und aus anderem Code einen Codeblock', () => {
    const html = renderMarkdown('```mermaid\ngraph TD\n  A-->B\n```\n\n```\nKosten $5\n```')
    expect(html).toContain('<div class="mermaid" data-src="graph TD\n  A--&#62;B\n"></div>')
    expect(html).toContain('<pre><code>Kosten $5</code></pre>')
  })

  it('verweist Folienbilder auf den Speicher statt auf eine Adresse', () => {
    const html = renderMarkdown('![IuF S04](folien/IuF/BA02-S04.jpg)')
    expect(html).toContain('<img data-folie="IuF/BA02-S04.jpg" alt="IuF S04" loading="lazy">')
    expect(html).not.toContain('src=')
  })

  it('öffnet Links außerhalb der App und entschärft andere Schemata', () => {
    const html = renderMarkdown('[Stud.IP](https://studip.example/x) und [böse](javascript:alert(1))')
    expect(html).toContain('<a href="https://studip.example/x" target="_blank" rel="noopener noreferrer">Stud.IP</a>')
    expect(html).not.toContain('javascript:')
    expect(html).toContain('böse')
  })

  it('versteht Obsidian-Links mit escaptem Strich in Tabellen', () => {
    const html = renderMarkdown('| A | B |\n|---|---|\n| x | [[BA02.pdf#page=3\\|IuF S. 3]] |')
    expect(html).toContain('<td>IuF S. 3</td>')
  })
})

describe('Auswahlfragen', () => {
  const sc: Item = {
    id: 1, module: 'A', week: 1, type: 'single_choice', question: 'F', answer: 'A',
    options: { choices: ['a', 'b', 'c', 'd'], correct: 2 }, source_file: null, source_page: null,
  }
  const mc: Item = { ...sc, type: 'multiple_choice', options: { choices: ['a', 'b', 'c', 'd'], correct: [0, 3] } }

  it('liest die richtigen Antworten für beide Typen', () => {
    expect(correctSet(sc)).toEqual([2])
    expect(correctSet(mc)).toEqual([0, 3])
    expect(isChoice(sc) && isChoice(mc)).toBe(true)
    expect(isChoice({ ...sc, type: 'karteikarte', options: null })).toBe(false)
  })

  it('wertet nur genau die richtige Auswahl als richtig', () => {
    expect(evaluate([0, 3], [0, 3], 4)).toEqual({ ok: true, marks: ['correct', '', '', 'correct'] })
    expect(evaluate([0], [0, 3], 4)).toEqual({ ok: false, marks: ['correct', '', '', 'missed'] })
    expect(evaluate([0, 1, 3], [0, 3], 4)).toEqual({ ok: false, marks: ['correct', 'wrong', '', 'correct'] })
    expect(evaluate([], [2], 4).ok).toBe(false)
  })

  it('mischt alle Positionen genau einmal', () => {
    let seed = 0.7
    const order = shuffledOrder(4, () => (seed = (seed * 9301 + 49297) % 233280 / 233280))
    expect([...order].sort()).toEqual([0, 1, 2, 3])
    expect(shuffledOrder(1)).toEqual([0])
  })
})

describe('Klausurtermine', () => {
  const heute = new Date(2026, 10, 9, 15, 0) // 09.11.2026 nachmittags

  it('zählt Kalendertage und erkennt geschriebene Klausuren', () => {
    expect(daysUntil('2026-11-09', heute)).toBe(0)
    expect(daysUntil('2027-02-10', heute)).toBe(93)
    expect(isWritten('2026-11-09', heute)).toBe(false)
    expect(isWritten('2026-11-08', heute)).toBe(true)
    expect(isWritten(null, heute)).toBe(false)
    expect(formatExam('2026-11-10', heute)).toBe('Klausur morgen')
    expect(formatDate('2027-02-19')).toBe('Fr 19.02.2027')
  })

  it('gewichtet nahe Klausuren stärker, nimmt aber keinem alles', () => {
    const w = { BIL: urgency('2026-11-30', heute), IuF: urgency('2027-03-15', heute) }
    const q = allocateNew({ BIL: 100, IuF: 100 }, w, 20)
    expect(q.BIL + q.IuF).toBe(20)
    expect(q.BIL).toBeGreaterThan(q.IuF)
    expect(q.IuF).toBeGreaterThan(0)
  })

  it('gibt nicht gebrauchte Plätze an andere Module weiter', () => {
    const q = allocateNew({ A: 2, B: 50 }, { A: 1, B: 0.01 }, 20)
    expect(q).toEqual({ A: 2, B: 18 })
    expect(allocateNew({ A: 0, B: 0 }, { A: 1, B: 1 }, 20)).toEqual({ A: 0, B: 0 })
  })

  it('hält die Quote beim Aufbau der Warteschlange ein', () => {
    const cs = [card(1, 'A', 1), card(2, 'A', 1), card(3, 'A', 2), card(4, 'B', 1), card(5, 'B', 2)]
    const q = buildQueue(cs, { now, newLimit: 20, newQuota: { A: 1, B: 2 } })
    expect(q.map((c) => c.item.id).sort()).toEqual([1, 4, 5])
    expect(overview(cs, now, 20, { A: 1, B: 2 }).total.fresh).toBe(3)
  })
})
