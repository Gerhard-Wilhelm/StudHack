import { describe, expect, it } from 'vitest'
import { alsModulWahl, farbenAus, FARBWAHL, istFarbe, kuerzelAus, mitEigenen, normKuerzel } from './farben'

describe('Modulfarben', () => {
  it('prüft Farben wie die Datenbank', () => {
    expect(istFarbe('#d46be8')).toBe(true)
    expect(istFarbe('#D46BE8')).toBe(false)
    expect(istFarbe('#fff')).toBe(false)
    expect(istFarbe('rot')).toBe(false)
    expect(istFarbe(null)).toBe(false)
    expect(FARBWAHL.every((f) => istFarbe(f.farbe))).toBe(true)
    expect(new Set(FARBWAHL.map((f) => f.farbe)).size).toBe(FARBWAHL.length)
  })

  it('lässt eigene Farben vor den automatischen gelten', () => {
    const standard = { BIL: '#c2410c', MAK: '#a21caf' }
    expect(mitEigenen(standard, { MAK: '#0e7490', STA1: '#1d4ed8' })).toEqual({
      BIL: '#c2410c', MAK: '#0e7490', STA1: '#1d4ed8',
    })
    expect(mitEigenen(standard, { BIL: 'kaputt' })).toEqual(standard)
    expect(standard.MAK).toBe('#a21caf')
  })

  it('bereinigt eigene Kürzel', () => {
    expect(normKuerzel('  Bilanz  ', 'BIL')).toBe('Bilanz')
    expect(normKuerzel('Kosten   und Leistung', 'KLR')).toBe('Kosten und L')
    expect(normKuerzel('', 'BIL')).toBeUndefined()
    expect(normKuerzel('   ', 'BIL')).toBeUndefined()
    expect(normKuerzel('BIL', 'BIL')).toBeUndefined()
  })

  it('trennt Farben und Kürzel und liest alte Stände', () => {
    const wahl = alsModulWahl({ BIL: '#c2410c', MAK: { kuerzel: 'Makro' }, STA1: { color: 'kaputt', kuerzel: ' ' }, X: 7 })
    expect(wahl).toEqual({ BIL: { color: '#c2410c' }, MAK: { kuerzel: 'Makro' } })
    expect(farbenAus(wahl)).toEqual({ BIL: '#c2410c' })
    expect(kuerzelAus(wahl)).toEqual({ MAK: 'Makro' })
    expect(alsModulWahl(null)).toEqual({})
  })
})
