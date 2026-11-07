"""Tests für das Aufbereiten der Notizen. Aufruf: .venv/bin/python -m unittest importer.test_import_lesemodus"""

import tempfile
import unittest
from pathlib import Path

from importer.import_lesemodus import OHNE_IN_NOTIZ, OHNE_IN_UEBERSICHT, parse_note, parse_overview

UEBERSICHT = """---
tags: [modul]
kuerzel: TST
---

# Testmodul

## Eckdaten

- Kürzel: TST

## Wochen

| Woche | Thema |
|---|---|
| W01 | Einstieg |

## Lernmethoden

- Rechnen üben

## Offene Fragen

- Arbeitsnotiz
"""

NOTIZ = """---
woche: 1
quelle: "[[06 Anhänge/TST/Skript.pdf]]"
---

# TST W01 Einstieg

## Kernaussagen

Text ![[Skript S01.png]]

## Karteikarten

Frage::Antwort
"""


class AufbereitenTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.vault = Path(self.tmp.name)
        modul = self.vault / "01 Module" / "Testmodul"
        modul.mkdir(parents=True)
        (modul / "Testmodul.md").write_text(UEBERSICHT, encoding="utf-8")
        (modul / "TST W01 Einstieg.md").write_text(NOTIZ, encoding="utf-8")
        folien = self.vault / "06 Anhänge" / "TST" / "Folien"
        folien.mkdir(parents=True)
        (folien / "Skript S01.png").write_bytes(b"png")

    def tearDown(self):
        self.tmp.cleanup()

    def test_uebersicht_ohne_wochen_und_offene_fragen(self):
        m = parse_overview(self.vault / "01 Module" / "Testmodul" / "Testmodul.md", self.vault)
        self.assertEqual((m.modul, m.name), ("TST", "Testmodul"))
        self.assertIn("## Eckdaten", m.text)
        self.assertIn("## Lernmethoden", m.text)
        for titel in OHNE_IN_UEBERSICHT:
            self.assertNotIn(f"## {titel}", m.text)
        self.assertNotIn("Arbeitsnotiz", m.text)
        self.assertNotIn("# Testmodul", m.text)

    def test_notiz_ohne_karteikarten_und_mit_bildpfad(self):
        n = parse_note(self.vault / "01 Module" / "Testmodul" / "TST W01 Einstieg.md", self.vault)
        self.assertEqual((n.modul, n.woche, n.titel, n.quelle_datei), ("TST", 1, "Einstieg", "Skript.pdf"))
        for titel in OHNE_IN_NOTIZ:
            self.assertNotIn(f"## {titel}", n.text)
        self.assertIn("![Skript S01](folien/TST/Skript-S01.jpg)", n.text)
        self.assertEqual([b.pfad for b in n.bilder], ["TST/Skript-S01.jpg"])


if __name__ == "__main__":
    unittest.main()
