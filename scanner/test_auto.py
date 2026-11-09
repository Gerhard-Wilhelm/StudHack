"""Tests ohne Stud.IP. Aufruf: .venv/bin/python -m unittest scanner.test_auto"""

import unittest

from scanner.auto import meldung


def datei(modul, status="neu"):
    return {"modul": modul, "status": status}


class MeldungTest(unittest.TestCase):
    def test_nichts_neu(self):
        self.assertIsNone(meldung([], ["MAK"]))
        self.assertIsNone(meldung([datei("MAK", "nicht ladbar (403)")], ["MAK"]))

    def test_zaehlt_je_modul_in_config_reihenfolge(self):
        found = [datei("WiPo"), datei("MAK"), datei("MAK", "geändert"), datei("PuL", "nicht ladbar (404)")]
        self.assertEqual(meldung(found, ["IuF", "MAK", "WiPo", "PuL"]), "3 neue Dateien: MAK (2), WiPo (1)")

    def test_einzahl(self):
        self.assertEqual(meldung([datei("IuF")], ["IuF"]), "1 neue Datei: IuF (1)")


if __name__ == "__main__":
    unittest.main()
