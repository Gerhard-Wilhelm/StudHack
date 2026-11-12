import { describe, expect, it } from 'vitest'
import { FARBWAHL, istFarbe, mitEigenen } from './farben'

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
})
