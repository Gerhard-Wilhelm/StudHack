"""Tests ohne API-Aufrufe. Aufruf: .venv/bin/python -m unittest generator.test_generate_mc"""

import tempfile
import unittest
from pathlib import Path

from generator.generate_mc import Frage, anzahl, folienseite, strukturfehler


def roh(**over):
    f = {"typ": "single_choice", "frage": "Was gilt?", "antworten": ["A", "B", "C", "D"], "richtig": [1],
         "begruendung": "Weil.", "quelle_datei": "Makro-I-03.pdf", "quelle_seite": 7}
    f.update(over)
    return f


class StrukturTest(unittest.TestCase):
    def test_gueltig(self):
        self.assertIsNone(strukturfehler(roh()))
        self.assertIsNone(strukturfehler(roh(typ="multiple_choice", richtig=[0, 2])))

    def test_fehler(self):
        self.assertIsNotNone(strukturfehler(roh(antworten=["A", "B", "C"])))
        self.assertIsNotNone(strukturfehler(roh(antworten=["A", "B", "C", "A"])))
        self.assertIsNotNone(strukturfehler(roh(richtig=[0, 1])))
        self.assertIsNotNone(strukturfehler(roh(richtig=[4])))
        self.assertIsNotNone(strukturfehler(roh(richtig=[])))
        self.assertIsNotNone(strukturfehler(roh(typ="multiple_choice", richtig=[0, 1, 2, 3])))
        self.assertIsNotNone(strukturfehler(roh(quelle_seite=0)))
        self.assertIsNotNone(strukturfehler(roh(quelle_datei="Notiz")))


class AnzahlTest(unittest.TestCase):
    def test_modul_vor_vorgabe(self):
        cfg = {"auswahlfragen": {"single": 4, "multiple": 2},
               "module": {"MAK": {"auswahlfragen": {"single": 6, "multiple": 0}}, "IuF": {"name": "x"}}}
        self.assertEqual(anzahl(cfg, "MAK"), (6, 0))
        self.assertEqual(anzahl(cfg, "IuF"), (4, 2))
        self.assertEqual(anzahl(cfg, "Unbekannt"), (4, 2))


class FolienTest(unittest.TestCase):
    def test_seite_aus_textdatei(self):
        with tempfile.TemporaryDirectory() as tmp:
            ordner = Path(tmp) / "MAK"
            ordner.mkdir()
            (ordner / "Makro-I-03.txt").write_text("--- Seite 1 ---\nEins\n--- Seite 2 ---\nZwei\n", encoding="utf-8")
            self.assertEqual(folienseite("Makro-I-03.pdf", 2, Path(tmp)), "Zwei")
            self.assertIsNone(folienseite("Makro-I-03.pdf", 3, Path(tmp)))
            self.assertIsNone(folienseite("Andere.pdf", 1, Path(tmp)))


class ZeileTest(unittest.TestCase):
    def test_optionen_je_typ(self):
        sc = Frage("MAK", 3, "n.md", "single_choice", "F?", ["A", "B", "C", "D"], [2], "W", "x.pdf", 4)
        mc = Frage("WiPo", 2, "n.md", "multiple_choice", "F?", ["A", "B", "C", "D"], [3, 0], "W", "x.pdf", 4)
        self.assertEqual(sc.als_zeile()["options"], {"choices": ["A", "B", "C", "D"], "correct": 2})
        self.assertEqual(mc.als_zeile()["options"]["correct"], [0, 3])
        self.assertEqual(sc.als_zeile()["status"], "entwurf")
        self.assertEqual(sc.als_zeile()["origin"], "generator")


if __name__ == "__main__":
    unittest.main()
