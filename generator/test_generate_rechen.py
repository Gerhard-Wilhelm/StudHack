"""Tests ohne API-Aufrufe. Aufruf: .venv/bin/python -m unittest generator.test_generate_rechen"""

import unittest

from generator.generate_rechen import Rechenaufgabe, abschnitte, aktiv, baue, felder, kern, strukturfehler, zerlege

# Selbst geschriebener Abschnitt mit den drei Formen aus den Notizen
UEBUNGEN = """Vorspann: Alle Zinsen sind jährlich.

### Aufgabe 1: Endkapital

Du legst 1000 € zu 5 % für zwei Jahre an. Wie hoch ist das Endkapital?

> [!question]- Lösung
> $K_2 = 1000 \\cdot 1{,}05^2 = 1102{,}50$
>
> Also 1102,50 €.

### Übungsblatt 2

Gehört zu Woche 3, Aufgaben stehen dort.

### Aufgabe 2: Zwei Teile

Ein Projekt kostet 100 € und bringt in einem Jahr 108 €.

a) Kapitalwert bei 10 %?

> [!question]- Lösung
> $-1{,}82$ €

b) Interner Zinssatz?

> [!question]- Lösung
> 8 %

### Rechenaufgaben

**R1.** Median von 3, 9, 4?

> [!question]- Lösung
> 4

**R2.** Mittel von 2 und 4?

> [!question]- Lösung
> 3
"""


def feld(**over):
    e = {"label": "a) Endkapital", "wert": 1102.5, "toleranz": 0.005, "einheit": "€"}
    e.update(over)
    return e


def roh(**over):
    a = {"aufgabe": 1, "teile": [1], "zusatz": "", "eingaben": [feld()], "quelle_datei": "Demo.pdf", "quelle_seite": 4}
    a.update(over)
    return a


class ZerlegenTest(unittest.TestCase):
    def setUp(self):
        self.aufgaben, self.markiert = zerlege(UEBUNGEN)

    def test_aufgaben_und_teile(self):
        self.assertEqual([(a.nr, a.titel, len(a.teile)) for a in self.aufgaben],
                         [(1, "Aufgabe 1: Endkapital", 1), (2, "Aufgabe 2: Zwei Teile", 2), (3, "Rechenaufgaben", 2)])
        eins = self.aufgaben[0].teile[0]
        self.assertEqual(eins.text, "Du legst 1000 € zu 5 % für zwei Jahre an. Wie hoch ist das Endkapital?")
        self.assertEqual(eins.loesung, "$K_2 = 1000 \\cdot 1{,}05^2 = 1102{,}50$\n\nAlso 1102,50 €.")
        zwei = self.aufgaben[1].teile
        self.assertTrue(zwei[0].text.startswith("Ein Projekt kostet"))
        self.assertTrue(zwei[0].text.endswith("a) Kapitalwert bei 10 %?"))
        self.assertEqual(zwei[1].text, "b) Interner Zinssatz?")
        self.assertEqual(zwei[1].loesung, "8 %")

    def test_markierung_fuer_claude(self):
        self.assertIn("Vorspann: Alle Zinsen", self.markiert)
        self.assertIn("### Übungsblatt 2", self.markiert)
        self.assertIn("[Aufgabe 2] Aufgabe 2: Zwei Teile", self.markiert)
        self.assertIn("[Teil 3.2]\n**R2.** Mittel von 2 und 4?\nLösung:\n3", self.markiert)
        self.assertNotIn("[!question]", self.markiert)

    def test_frage_und_loesung_woertlich(self):
        frage, loesung = baue(roh(aufgabe=2, teile=[2, 1], zusatz="Kalkulationszins 10 %."), self.aufgaben)
        self.assertTrue(frage.startswith("**Aufgabe 2: Zwei Teile**\n\nKalkulationszins 10 %.\n\nEin Projekt"))
        self.assertTrue(frage.endswith("b) Interner Zinssatz?"))
        self.assertEqual(loesung, "$-1{,}82$ €\n\n8 %")
        self.assertEqual(kern(roh(aufgabe=2, teile=[2, 1], zusatz="X"), self.aufgaben).split("\n\n")[-1],
                         "b) Interner Zinssatz?")
        self.assertIn(kern(roh(aufgabe=3, teile=[2]), self.aufgaben), baue(roh(aufgabe=3, teile=[2]), self.aufgaben)[0])
        frage, loesung = baue(roh(aufgabe=3, teile=[2]), self.aufgaben)
        self.assertEqual(frage, "**Rechenaufgaben**\n\n**R2.** Mittel von 2 und 4?")
        self.assertEqual(loesung, "3")

    def test_ohne_loesungen(self):
        self.assertEqual(zerlege("### Aufgabe\n\nNur Text.\n")[0], [])


class StrukturTest(unittest.TestCase):
    def setUp(self):
        self.aufgaben = zerlege(UEBUNGEN)[0]

    def test_gueltig(self):
        self.assertIsNone(strukturfehler(roh(), self.aufgaben))
        self.assertIsNone(strukturfehler(roh(eingaben=[feld(), feld(label="b) Zinsen", wert=102.5)]), self.aufgaben))
        self.assertIsNone(strukturfehler(roh(eingaben=[feld(wert=0, toleranz=0)]), self.aufgaben))
        self.assertIsNone(strukturfehler(roh(eingaben=[feld(wert=200, toleranz=4)]), self.aufgaben))
        self.assertIsNone(strukturfehler(roh(eingaben=[feld(wert=0.33, toleranz=0.01)]), self.aufgaben))

    def test_fehler(self):
        f = lambda **o: strukturfehler(roh(**o), self.aufgaben)
        self.assertIsNotNone(f(aufgabe=0))
        self.assertIsNotNone(f(aufgabe=4))
        self.assertIsNotNone(f(teile=[]))
        self.assertIsNotNone(f(teile=[2]))
        self.assertIsNotNone(f(eingaben=[]))
        self.assertIsNotNone(f(eingaben=[feld(label=f"{i}") for i in range(5)]))
        self.assertIsNotNone(f(eingaben=[feld(), feld()]))
        self.assertIsNotNone(f(eingaben=[feld(label=" ")]))
        self.assertIsNotNone(f(eingaben=[feld(toleranz=-1)]))
        self.assertIsNotNone(f(eingaben=[feld(wert=float("nan"))]))
        self.assertIsNotNone(f(quelle_seite=0))
        self.assertIsNotNone(f(quelle_datei="Notiz"))


class ToleranzTest(unittest.TestCase):
    def test_zu_gross_wird_begrenzt(self):
        t = lambda **o: felder(roh(eingaben=[feld(**o)]))[0]["toleranz"]
        self.assertEqual(t(toleranz=0.005), 0.005)
        self.assertAlmostEqual(t(toleranz=50), 22.05)
        self.assertEqual(t(wert=200, toleranz=4), 4)
        self.assertEqual(t(wert=200, toleranz=4.5), 4)
        self.assertEqual(t(wert=0.3, toleranz=0.05), 0.01)
        self.assertEqual(t(wert=0, toleranz=0.02), 0.01)


class KiTest(unittest.TestCase):
    def test_vorspann_kennzeichnet_bis_zum_naechsten(self):
        text = ("Die folgenden Aufgaben sind KI-Ergänzungen.\n\n### Aufgabe 1: Zins\n\nX?\n\n> [!question]- Lösung\n> 1\n\n"
                "### Aus dem Übungsblatt\n\nOffizielle Aufgaben.\n\n### Aufgabe 2: Rente\n\nY?\n\n> [!question]- Lösung\n> 2\n\n"
                "### KI-Aufgaben im Klausurstil\n\nKI-Ergänzung, nicht aus den Folien.\n\n"
                "### KI-Aufgabe E1: Barwert\n\nZ?\n\n> [!question]- Lösung\n> 3\n")
        a = zerlege(text)[0]
        self.assertEqual([x.ki for x in a], [True, False, True])
        self.assertEqual(baue(roh(aufgabe=1), a)[0], "**Aufgabe 1: Zins** (KI-Aufgabe)\n\nX?")
        self.assertEqual(baue(roh(aufgabe=2), a)[0], "**Aufgabe 2: Rente**\n\nY?")
        self.assertEqual(baue(roh(aufgabe=3), a)[0], "**KI-Aufgabe E1: Barwert**\n\nZ?")
        self.assertIn("[Aufgabe 1] Aufgabe 1: Zins (KI-Aufgabe)", zerlege(text)[1])

    def test_gemischter_vorspann_kennzeichnet_nicht(self):
        text = ("Aufgaben 1 bis 3 stammen aus den Folien, 4 bis 6 sind KI-Aufgaben.\n\n"
                "### Aufgabe 1: Takt\n\nX?\n\n> [!question]- Lösung\n> 1\n")
        self.assertFalse(zerlege(text)[0][0].ki)
        self.assertTrue(zerlege("KI-Ergänzung, nicht aus den Folien.\n\n### A\n\nX?\n\n> [!question]- Lösung\n> 1\n")[0][0].ki)
        self.assertTrue(zerlege("Die folgenden Aufgaben sind KI-Ergänzung, nicht aus den Folien. Die Verfahren stammen "
                                "aus den Folien.\n\n### A\n\nX?\n\n> [!question]- Lösung\n> 1\n")[0][0].ki)


class AbschnitteTest(unittest.TestCase):
    def test_nur_formeln_und_uebungen(self):
        text = "# Titel\n\n## Kernaussagen\nA\n\n## Formeln und Verfahren\nF\n\n## Übungsaufgaben\nU\n\n## Offene Fragen\nO\n"
        teil = abschnitte(text)
        self.assertIn("## Formeln und Verfahren\nF", teil)
        self.assertIn("## Übungsaufgaben\nU", teil)
        self.assertNotIn("Kernaussagen", teil)
        self.assertNotIn("Offene", teil)
        self.assertEqual(abschnitte("## Kernaussagen\nA\n"), "")


class ModulTest(unittest.TestCase):
    def test_abschalten(self):
        cfg = {"module": {"WiPo": {"rechenaufgaben": False}, "IuF": {"name": "x"}}}
        self.assertFalse(aktiv(cfg, "WiPo"))
        self.assertTrue(aktiv(cfg, "IuF"))
        self.assertTrue(aktiv(cfg, "Unbekannt"))


class ZeileTest(unittest.TestCase):
    def test_zeile(self):
        a = Rechenaufgabe("IuF", 2, "n.md", "F?", "L", felder(roh(eingaben=[feld(label=" a) K ", einheit=" € ")])),
                          "x.pdf", 4)
        z = a.als_zeile()
        self.assertEqual(z["type"], "rechenaufgabe")
        self.assertEqual(z["eingaben"], [{"label": "a) K", "wert": 1102.5, "toleranz": 0.005, "einheit": "€"}])
        self.assertEqual(z["status"], "entwurf")
        self.assertEqual(z["origin"], "generator")
        self.assertNotIn("options", z)

    def test_hash_unabhaengig_von_leerraum(self):
        a = Rechenaufgabe("IuF", 2, "n.md", "F  ?", "L", [], "x.pdf", 4)
        b = Rechenaufgabe("IuF", 2, "n.md", "F ?", "L", [], "x.pdf", 4)
        self.assertEqual(a.hash, b.hash)


if __name__ == "__main__":
    unittest.main()
