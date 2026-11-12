// Modulfarben: Auswahl in den Einstellungen und Zusammenführen mit den automatischen Farben.

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
