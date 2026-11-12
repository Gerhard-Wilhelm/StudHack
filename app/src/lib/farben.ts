// Modulfarben und eigene Kürzel: Auswahl in den Einstellungen und Zusammenführen mit den Standardwerten.

/** Farben zur Auswahl. Mitteltöne, die auf hellem Grund lesbar sind; im dunklen Modus hellt --mc sie auf. */
export const FARBWAHL: { farbe: string; name: string }[] = [
  { farbe: '#c2410c', name: 'Orange' },
  { farbe: '#b45309', name: 'Bernstein' },
  { farbe: '#ca8a04', name: 'Gelb' },
  { farbe: '#4d7c0f', name: 'Oliv' },
  { farbe: '#047857', name: 'Grün' },
  { farbe: '#0e7490', name: 'Petrol' },
  { farbe: '#1d4ed8', name: 'Blau' },
  { farbe: '#7c3aed', name: 'Violett' },
  { farbe: '#a21caf', name: 'Lila' },
  { farbe: '#db2777', name: 'Pink' },
  { farbe: '#be123c', name: 'Rot' },
  { farbe: '#475569', name: 'Schiefer' },
]

/** Gültige Farbe, wie sie auch die Datenbank verlangt: # und sechs kleine Hex-Ziffern. */
export function istFarbe(s: unknown): s is string {
  return typeof s === 'string' && /^#[0-9a-f]{6}$/.test(s)
}

/** Automatische Farben, überschrieben von den selbst gewählten. Ungültige Werte werden ignoriert. */
export function mitEigenen(standard: Record<string, string>, eigene: Record<string, string>): Record<string, string> {
  const out = { ...standard }
  for (const [modul, farbe] of Object.entries(eigene)) if (istFarbe(farbe)) out[modul] = farbe
  return out
}

/** Längstes erlaubtes Kürzel, wie in der Datenbank. */
export const KUERZEL_MAX = 12

/** Selbst gewählte Einstellungen eines Moduls. Fehlt ein Feld, gilt der Standard. */
export interface ModulWahl {
  color?: string
  kuerzel?: string
}

/** Eingabe zu einem gültigen Kürzel: Leerraum weg, gekürzt, leer oder gleich dem Original heißt kein eigenes. */
export function normKuerzel(eingabe: string, original: string): string | undefined {
  const k = eingabe.trim().replace(/\s+/g, ' ').slice(0, KUERZEL_MAX).trim()
  return k && k !== original ? k : undefined
}

/** Nur die gültigen Farben aus den Einstellungen. */
export function farbenAus(wahl: Record<string, ModulWahl>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [modul, w] of Object.entries(wahl)) if (istFarbe(w.color)) out[modul] = w.color
  return out
}

/** Nur die eigenen Kürzel aus den Einstellungen. */
export function kuerzelAus(wahl: Record<string, ModulWahl>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [modul, w] of Object.entries(wahl)) if (typeof w.kuerzel === 'string' && w.kuerzel.trim()) out[modul] = w.kuerzel
  return out
}

/** Gespeicherter Stand in neuer Form. Ältere Stände enthielten nur die Farbe als Text. */
export function alsModulWahl(roh: unknown): Record<string, ModulWahl> {
  const out: Record<string, ModulWahl> = {}
  if (!roh || typeof roh !== 'object') return out
  for (const [modul, w] of Object.entries(roh as Record<string, unknown>)) {
    if (typeof w === 'string') {
      if (istFarbe(w)) out[modul] = { color: w }
    } else if (w && typeof w === 'object') {
      const { color, kuerzel } = w as Record<string, unknown>
      const neu: ModulWahl = {}
      if (istFarbe(color)) neu.color = color
      if (typeof kuerzel === 'string' && kuerzel.trim()) neu.kuerzel = kuerzel
      if (neu.color || neu.kuerzel) out[modul] = neu
    }
  }
  return out
}
