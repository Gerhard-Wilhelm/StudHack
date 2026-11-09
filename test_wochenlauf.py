"""Tests ohne Supabase. Aufruf: .venv/bin/python -m unittest test_wochenlauf"""

import tempfile
import unittest
from pathlib import Path

from importer.import_lesemodus import Bild, datei_hash
from importer.import_notes import Item, aenderungen
from wochenlauf import bilder_neu


class BilderTest(unittest.TestCase):
    def test_nur_neue_oder_geaenderte(self):
        with tempfile.TemporaryDirectory() as tmp:
            a, b, c = (Path(tmp) / n for n in ("a.png", "b.png", "c.png"))
            for f in (a, b, c):
                f.write_bytes(f.name.encode())
            bilder = {"X/a.jpg": Bild(a, "X/a.jpg"), "X/b.jpg": Bild(b, "X/b.jpg"), "X/c.jpg": Bild(c, "X/c.jpg")}
            manifest = {"X/a.jpg": datei_hash(a), "X/b.jpg": "alt"}
            self.assertEqual(bilder_neu(bilder, manifest), ["X/b.jpg", "X/c.jpg"])


class AenderungenTest(unittest.TestCase):
    def test_neu_geaendert_und_nicht_importiert(self):
        a = Item("MAK", 1, "karteikarte", "Was ist BIP?", "Wert aller Güter", "n.md")
        b = Item("MAK", 1, "karteikarte", "Was ist Inflation?", "Preisanstieg", "n.md")
        c = Item("MAK", 2, "karteikarte", "Was ist Solow?", "Modell", "n.md")
        zeile = lambda it, **over: {"id": 7, "origin": "import", **{k: it.als_zeile()[k] for k in
                                    ("answer", "source_file", "source_page", "week", "origin_ref")}, **over}
        existing = {b.hash: zeile(b, answer="alt"), c.hash: zeile(c, answer="anders", origin="manuell")}
        neu, geaendert = aenderungen([a, b, c], existing)
        self.assertEqual(neu, [a])
        self.assertEqual(geaendert, [(7, b)])


if __name__ == "__main__":
    unittest.main()
