import type { ModuleInfo, Note } from './types'

// Selbst geschriebene Demo-Notizen. Keine Folieninhalte.

export const DEMO_NOTES: Note[] = [
  {
    id: 1, module: 'Finanzen', week: 1, title: 'Zinsrechnung', source_file: 'Demo_Finanzen.pdf',
    body: `## Kernaussagen

- Geld heute ist mehr wert als Geld morgen, weil es Zinsen bringen kann.
- Beim **Zinseszins** werden Zinsen mitverzinst, das Kapital wächst exponentiell ([[Demo_Finanzen.pdf#page=3|Demo S. 3]]).

![Zinseszins](folien/Demo/zinseszins.svg)

## Formeln und Verfahren

Endwert nach $n$ Jahren bei Zinssatz $i$:

$$K_n = K_0 \\cdot (1+i)^n$$

| Größe | Bedeutung |
|---|---|
| $K_0$ | Startkapital |
| $i$ | Zinssatz pro Jahr |
| $n$ | Laufzeit in Jahren |

## Verständnisfragen

**1. Warum wächst das Kapital beim Zinseszins schneller als bei einfacher Verzinsung?**

> [!question]- Lösung
> Weil in jedem Jahr auch die Zinsen der Vorjahre verzinst werden. Der Zuwachs wird dadurch jedes Jahr größer.

## Offene Fragen

- [ ] Wie ändert sich die Rechnung bei monatlicher Verzinsung?
`,
  },
  {
    id: 2, module: 'Statistik', week: 1, title: 'Lagemaße', source_file: 'Demo_Statistik.pdf',
    body: `## Kernaussagen

- Lagemaße beschreiben, wo die Werte einer Verteilung ungefähr liegen.
- Welches Maß passt, hängt vom **Skalenniveau** ab.

\`\`\`mermaid
flowchart TD
  A[Skalenniveau?] -->|nominal| B[Modus]
  A -->|ordinal| C[Median]
  A -->|metrisch| D[Mittelwert oder Median]
\`\`\`

## Begriffe und Definitionen

- **Modus**: der häufigste Wert.
- **Median**: der mittlere Wert der sortierten Daten.
- **Mittelwert**: $\\bar{x} = \\frac{1}{n} \\sum_{i=1}^{n} x_i$

## Verständnisfragen

**1. Warum ist der Mittelwert bei Schulnoten problematisch?**

> [!question]- Lösung
> Schulnoten sind ordinal. Die Abstände zwischen den Noten sind nicht sicher gleich groß, deshalb ist der Median das passendere Maß.
`,
  },
]

export const DEMO_MODULES: ModuleInfo[] = [
  {
    module: 'Finanzen', name: 'Finanzen für Einsteiger',
    body: `## Eckdaten

- **Kürzel:** Finanzen
- **Prüfung:** Klausur, 60 Minuten, Taschenrechner erlaubt
- **Material:** Demo-Folien, ein Übungsblatt pro Woche

## Lernmethoden

- Formeln wie $K_n = K_0 \\cdot (1+i)^n$ selbst herleiten statt auswendig lernen
- Jede Woche zwei Rechenaufgaben ohne Lösung versuchen
`,
  },
  {
    module: 'Statistik', name: 'Beschreibende Statistik',
    body: `## Eckdaten

- **Kürzel:** Statistik
- **Prüfung:** E-Klausur mit Antwort-Wahl und Rechenfeldern
- **Hilfsmittel:** Formelsammlung

## Ablaufplan

1. Lagemaße
2. Streuungsmaße
3. Zusammenhangsmaße

## Lernmethoden

- Zu jedem Maß ein Beispiel mit fünf Zahlen von Hand rechnen
`,
  },
]
