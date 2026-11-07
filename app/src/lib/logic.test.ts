import { describe, expect, it } from 'vitest'
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
