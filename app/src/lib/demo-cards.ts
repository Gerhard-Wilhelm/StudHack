import type { Item } from './types'

// Selbst geschriebene Beispielkarten für den Demo-Modus. Keine Folieninhalte.

export const DEMO_ITEMS: Item[] = [
  {
    id: 1, module: 'Finanzen', week: 1, type: 'karteikarte',
    question: 'Was beschreibt der **Barwert** einer Zahlung?',
    answer: 'Den heutigen Wert einer künftigen Zahlung, abgezinst mit dem Kalkulationszins.',
    options: null, source_file: 'Demo_Finanzen.pdf', source_page: 3,
  },
  {
    id: 2, module: 'Finanzen', week: 1, type: 'rechenaufgabe',
    question: 'Du legst $1000$ € zu $5\\,\\%$ Zins für zwei Jahre an. Wie viel hast du am Ende?',
    answer: '$$K_2 = 1000 \\cdot 1{,}05^2 = 1102{,}50$$\nAlso **1102,50 €**. Siehe [[Demo_Finanzen.pdf#page=4|Demo Finanzen S. 4]].',
    options: null, source_file: 'Demo_Finanzen.pdf', source_page: 4,
    eingaben: [{ label: 'Endkapital $K_2$', wert: 1102.5, toleranz: 0.005, einheit: '€' }],
  },
  {
    id: 3, module: 'Finanzen', week: 2, type: 'verstaendnisfrage',
    question: 'Warum sinkt der Barwert, wenn der Zins steigt?',
    answer: 'Weil künftige Zahlungen stärker abgezinst werden:\n$$PV = \\frac{C}{(1+i)^t}$$\nMit größerem $i$ wird der Nenner größer.',
    options: null, source_file: 'Demo_Finanzen.pdf', source_page: 7,
  },
  {
    id: 4, module: 'Finanzen', week: 2, type: 'single_choice',
    question: 'Welche Kennzahl ist der Zins, bei dem der Kapitalwert null wird?',
    answer: 'Der **interne Zinsfuß**.',
    options: { choices: ['Kalkulationszins', 'Interner Zinsfuß', 'Rendite nach Steuern', 'Annuität'], correct: 1 },
    source_file: 'Demo_Finanzen.pdf', source_page: 9,
  },
  {
    id: 5, module: 'Finanzen', week: 3, type: 'karteikarte',
    question: 'Was ist eine Annuität?',
    answer: 'Eine gleichbleibende Zahlung pro Periode, die Zins und Tilgung zusammenfasst.',
    options: null, source_file: 'Demo_Finanzen.pdf', source_page: 12,
  },
  {
    id: 6, module: 'Statistik', week: 1, type: 'karteikarte',
    question: 'Wie berechnest du das arithmetische Mittel?',
    answer: '$$\\bar{x} = \\frac{1}{n} \\sum_{i=1}^{n} x_i$$',
    options: null, source_file: 'Demo_Statistik.pdf', source_page: 2,
  },
  {
    id: 7, module: 'Statistik', week: 1, type: 'rechenaufgabe',
    question: 'Bestimme den Median von $3, 9, 4, 7, 1$.',
    answer: 'Sortiert: $1, 3, 4, 7, 9$. Der mittlere Wert ist **4**.',
    options: null, source_file: 'Demo_Statistik.pdf', source_page: 5,
    eingaben: [{ label: 'Median', wert: 4, toleranz: 0, einheit: '' }],
  },
  {
    id: 8, module: 'Statistik', week: 2, type: 'verstaendnisfrage',
    question: 'Wann ist der Median aussagekräftiger als das Mittel?',
    answer: 'Bei schiefen Verteilungen oder Ausreißern, weil einzelne extreme Werte ihn kaum verschieben.',
    options: null, source_file: 'Demo_Statistik.pdf', source_page: 6,
  },
  {
    id: 9, module: 'Statistik', week: 2, type: 'karteikarte',
    question: 'Was misst die Varianz?',
    answer: 'Die mittlere quadratische Abweichung vom Mittelwert:\n$$s^2 = \\frac{1}{n} \\sum (x_i - \\bar{x})^2$$',
    options: null, source_file: 'Demo_Statistik.pdf', source_page: 8,
  },
  {
    id: 10, module: 'Statistik', week: 3, type: 'single_choice',
    question: 'Welche Skala erlaubt eine Rangfolge, aber keine sinnvollen Abstände?',
    answer: 'Die **Ordinalskala**, zum Beispiel Schulnoten.',
    options: { choices: ['Nominalskala', 'Ordinalskala', 'Intervallskala', 'Verhältnisskala'], correct: 1 },
    source_file: 'Demo_Statistik.pdf', source_page: 11,
  },
  {
    id: 11, module: 'Statistik', week: 3, type: 'multiple_choice',
    question: 'Welche Maße beschreiben die Streuung einer Verteilung? (mehrere Antworten möglich)',
    answer: 'Varianz und Spannweite messen, wie weit die Werte auseinanderliegen. Median und Modus sind Lagemaße.',
    options: { choices: ['Varianz', 'Median', 'Spannweite', 'Modus'], correct: [0, 2] },
    source_file: 'Demo_Statistik.pdf', source_page: 12,
  },
]

/** Entwürfe, wie sie der Generator anlegen würde, für die Freigabe-Liste in der Demo. */
export const DEMO_DRAFTS: Item[] = [
  {
    id: 101, module: 'Finanzen', week: 1, type: 'single_choice',
    question: 'Du legst $500$ € für ein Jahr zu $4\\,\\%$ an. Wie hoch ist der Endwert?',
    answer: '$500 \\cdot 1{,}04 = 520$ €. 504 € entsteht, wenn man 4 € statt 4 % rechnet.',
    options: { choices: ['520 €', '504 €', '540 €', '500 €'], correct: 0 },
    source_file: 'Demo_Finanzen.pdf', source_page: 4,
  },
  {
    id: 102, module: 'Finanzen', week: 1, type: 'multiple_choice',
    question: 'Was erhöht den Barwert einer künftigen Zahlung? (mehrere Antworten möglich)',
    answer: 'Ein niedrigerer Zins und eine kürzere Laufzeit verringern die Abzinsung. Höhere Zinsen und längere Laufzeiten senken den Barwert.',
    options: { choices: ['Niedrigerer Zins', 'Längere Laufzeit', 'Kürzere Laufzeit', 'Höherer Zins'], correct: [0, 2] },
    source_file: 'Demo_Finanzen.pdf', source_page: 7,
  },
  {
    id: 103, module: 'Statistik', week: 1, type: 'single_choice',
    question: 'Welches Lagemaß ändert sich nicht, wenn der größte Wert verdoppelt wird?',
    answer: 'Der Median hängt nur von der Mitte der sortierten Daten ab. Mittelwert und Summe steigen, die Spannweite auch.',
    options: { choices: ['Median', 'Arithmetisches Mittel', 'Spannweite', 'Summe der Werte'], correct: 0 },
    source_file: 'Demo_Statistik.pdf', source_page: 5,
  },
  {
    id: 104, module: 'Finanzen', week: 2, type: 'rechenaufgabe',
    question: 'Ein Projekt kostet heute $100$ € und bringt in einem Jahr $108$ €. Der Kalkulationszins ist $10\\,\\%$.\n\na) Wie hoch ist der Kapitalwert?\n\nb) Wie hoch ist der interne Zinssatz?',
    answer: 'a) $C_0 = -100 + \\frac{108}{1{,}1} = -1{,}82$ €, das Projekt lohnt sich nicht.\n\nb) $-100 + \\frac{108}{1 + i} = 0$ ergibt $i = 8\\,\\%$.',
    options: null, source_file: 'Demo_Finanzen.pdf', source_page: 9,
    eingaben: [
      { label: 'a) Kapitalwert', wert: -1.82, toleranz: 0.005, einheit: '€' },
      { label: 'b) Interner Zinssatz', wert: 8, toleranz: 0.005, einheit: '%' },
    ],
  },
]
