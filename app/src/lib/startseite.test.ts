import { describe, expect, it } from 'vitest'
import { dringlichkeit } from './exams'
import { dauerText, naechsterBlock, type StudyBlock } from './plan'

const block = (id: number, start: string, dauer: number, extra: Partial<StudyBlock> = {}): StudyBlock => ({
  id, module: 'MAK', day: '2026-11-12', start_time: start, duration_min: dauer, done: false, ...extra,
})
const um = (zeit: string) => new Date(`2026-11-12T${zeit}:00`)

describe('Startseite', () => {
  it('findet den laufenden oder nächsten Block von heute', () => {
    const bloecke = [block(2, '18:00', 60), block(1, '10:00', 90), block(3, '08:00', 30, { done: true })]
    expect(naechsterBlock(bloecke, um('08:12'))).toMatchObject({ block: { id: 1 }, laeuft: false, minuten: 108 })
    expect(naechsterBlock(bloecke, um('10:50'))).toMatchObject({ block: { id: 1 }, laeuft: true, minuten: 40 })
    expect(naechsterBlock(bloecke, um('11:30'))).toMatchObject({ block: { id: 2 }, laeuft: false })
    expect(naechsterBlock(bloecke, um('19:00'))).toBeNull()
    expect(naechsterBlock([block(4, '10:00', 60, { day: '2026-11-13' })], um('08:00'))).toBeNull()
  })

  it('schreibt Dauern kurz', () => {
    expect(dauerText(108)).toBe('1 Std. 48 Min.')
    expect(dauerText(120)).toBe('2 Std.')
    expect(dauerText(45)).toBe('45 Min.')
  })

  it('färbt den Countdown nach Dringlichkeit', () => {
    const heute = new Date('2026-11-12T12:00:00')
    expect(dringlichkeit('2027-02-10', heute)).toBe('fern')
    expect(dringlichkeit('2026-12-10', heute)).toBe('nah')
    expect(dringlichkeit('2026-11-26', heute)).toBe('nah')
    expect(dringlichkeit('2026-11-25', heute)).toBe('knapp')
  })
})
