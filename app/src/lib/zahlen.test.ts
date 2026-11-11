import { describe, expect, it } from 'vitest'
import { leseZahl, pruefe, vorschlag, zeigeZahl } from './zahlen'

const feld = (wert: number, toleranz = 0.005, einheit = '') => ({ label: 'x', wert, toleranz, einheit })

describe('Zahleneingabe', () => {
  it('liest deutsche und englische Schreibweisen', () => {
    expect(leseZahl('1102,5')).toBe(1102.5)
    expect(leseZahl('1.102,50')).toBe(1102.5)
    expect(leseZahl('1 102,50 €')).toBe(1102.5)
    expect(leseZahl('1102.5')).toBe(1102.5)
    expect(leseZahl('1,102.50')).toBe(1102.5)
    expect(leseZahl('1.102')).toBe(1102)
    expect(leseZahl('1.234.567')).toBe(1234567)
    expect(leseZahl('0,5')).toBe(0.5)
    expect(leseZahl('0.5')).toBe(0.5)
    expect(leseZahl('1,234')).toBe(1.234)
    expect(leseZahl('-3,2')).toBe(-3.2)
    expect(leseZahl('−3,2')).toBe(-3.2)
    expect(leseZahl('5 %')).toBe(5)
    expect(leseZahl(',5')).toBe(0.5)
  })

  it('erkennt Eingaben ohne Zahl', () => {
    expect(leseZahl('')).toBeNull()
    expect(leseZahl('abc')).toBeNull()
    expect(leseZahl('1,2,3')).toBeNull()
    expect(leseZahl('-')).toBeNull()
    expect(leseZahl('1.2.3')).toBeNull()
  })

  it('vergleicht mit Toleranz', () => {
    expect(pruefe('1102,50', feld(1102.5))).toBe('richtig')
    expect(pruefe('1102,504', feld(1102.5))).toBe('richtig')
    expect(pruefe('1102,51', feld(1102.5))).toBe('falsch')
    expect(pruefe('4', feld(4, 0))).toBe('richtig')
    expect(pruefe('4,1', feld(4, 0))).toBe('falsch')
    expect(pruefe('-1,82', feld(-1.82))).toBe('richtig')
    expect(pruefe('1,82', feld(-1.82))).toBe('falsch')
    expect(pruefe('  ', feld(1))).toBe('leer')
    expect(pruefe('x', feld(1))).toBe('ungueltig')
  })

  it('nimmt bei Prozent auch den Anteil', () => {
    expect(pruefe('8', feld(8, 0.005, '%'))).toBe('richtig')
    expect(pruefe('8 %', feld(8, 0.005, '%'))).toBe('richtig')
    expect(pruefe('0,08', feld(8, 0.005, '%'))).toBe('richtig')
    expect(pruefe('0,08', feld(8, 0.005, '€'))).toBe('falsch')
  })

  it('schlägt eine Bewertung vor', () => {
    expect(vorschlag(['richtig', 'richtig'])).toBe(3)
    expect(vorschlag(['richtig', 'falsch'])).toBe(2)
    expect(vorschlag(['richtig', 'leer'])).toBe(2)
    expect(vorschlag(['falsch', 'ungueltig'])).toBe(1)
    expect(vorschlag(['leer', 'leer'])).toBeUndefined()
  })

  it('zeigt Sollwerte deutsch an', () => {
    expect(zeigeZahl(1102.5, '€')).toBe('1.102,5 €')
    expect(zeigeZahl(-1.82)).toBe('-1,82')
  })
})
