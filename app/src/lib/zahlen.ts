import type { Eingabe, Grade } from './types'

// Rechenaufgaben: deutsche Zahleneingabe lesen und mit dem Sollwert vergleichen.

export type Status = 'richtig' | 'falsch' | 'leer' | 'ungueltig'

/**
 * Liest eine Zahl wie "1.102,50", "1102,5", "-3,2", "5 %" oder "1 102,50 €".
 * Ein einzelner Punkt mit genau drei Ziffern danach gilt als Tausenderpunkt ("1.102" ist 1102).
 * Gibt null zurück, wenn keine Zahl erkennbar ist.
 */
export function leseZahl(text: string): number | null {
  let s = text.replace(/[\s  ]/g, '').replace(/[−–]/g, '-').replace(/[€%a-zA-ZäöüÄÖÜß]+$/u, '')
  if (!/^[-+]?[\d.,]+$/.test(s) || !/\d/.test(s)) return null
  const komma = s.lastIndexOf(',')
  const punkt = s.lastIndexOf('.')
  if (komma >= 0 && punkt >= 0) {
    // Das hintere Zeichen trennt die Nachkommastellen, das andere die Tausender
    const dezimal = komma > punkt ? ',' : '.'
    const tausend = dezimal === ',' ? '.' : ','
    s = s.split(tausend).join('').replace(dezimal, '.')
  } else if (komma >= 0) {
    s = tausender(s, ',') ?? s.replace(',', '.')
  } else if (punkt >= 0) {
    s = tausender(s, '.') ?? s
  }
  if ((s.match(/\./g) ?? []).length > 1) return null
  const x = Number(s)
  return Number.isFinite(x) ? x : null
}

/** Ohne Tausendertrennzeichen, wenn sie als solche gemeint sind, sonst null. */
function tausender(s: string, zeichen: string): string | null {
  const teile = s.replace(/^[-+]/, '').split(zeichen)
  const gruppen = teile.slice(1).every((t) => t.length === 3) && teile[0].length > 0 && teile[0].length <= 3
  // "1.102" und "1.234.567" sind Tausender, "0,5" und "12,34" nicht. Ein einzelnes Komma ist immer Dezimal.
  if (gruppen && teile[0] !== '0' && (teile.length > 2 || zeichen === '.')) return s.split(zeichen).join('')
  return null
}

/** Vergleicht eine Eingabe mit dem Sollwert. Bei Prozent zählt auch der Anteil (0,05 für 5 %). */
export function pruefe(text: string, soll: Eingabe): Status {
  if (!text.trim()) return 'leer'
  const x = leseZahl(text)
  if (x === null) return 'ungueltig'
  const passt = (v: number) => Math.abs(v - soll.wert) <= soll.toleranz + 1e-9 * Math.max(1, Math.abs(soll.wert))
  return passt(x) || (soll.einheit === '%' && passt(x * 100)) ? 'richtig' : 'falsch'
}

/** Vorschlag für die Bewertung. Ohne jede Eingabe (auf Papier gerechnet) kein Vorschlag. */
export function vorschlag(status: Status[]): Grade | undefined {
  if (status.every((s) => s === 'leer')) return undefined
  const richtig = status.filter((s) => s === 'richtig').length
  return richtig === status.length ? 3 : richtig > 0 ? 2 : 1
}

/** Sollwert für die Anzeige, z. B. "1.102,5 €". */
export function zeigeZahl(wert: number, einheit = ''): string {
  const z = wert.toLocaleString('de-DE', { maximumFractionDigits: 6 })
  return einheit ? `${z} ${einheit}` : z
}
