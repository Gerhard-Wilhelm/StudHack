"""Tests ohne Stud.IP. Aufruf: .venv/bin/python -m unittest scanner.test_auto"""

import unittest

import requests

from scanner.auto import meldung, mit_wiederholung


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


class WiederholungTest(unittest.TestCase):
    def test_wartet_und_versucht_erneut(self):
        versuche, pausen, logs = [], [], []

        def scan():
            versuche.append(1)
            if len(versuche) < 3:
                raise requests.exceptions.ConnectionError("kein Netz")
            return "fertig"

        self.assertEqual(mit_wiederholung(scan, logs.append, warten=(120, 300, 600), sleep=pausen.append), "fertig")
        self.assertEqual(pausen, [120, 300])
        self.assertEqual(len(logs), 2)

    def test_gibt_nach_allen_versuchen_auf(self):
        pausen = []

        def scan():
            raise requests.exceptions.ConnectionError("kein Netz")

        with self.assertRaises(requests.exceptions.ConnectionError):
            mit_wiederholung(scan, lambda _: None, warten=(1, 2), sleep=pausen.append)
        self.assertEqual(pausen, [1, 2])

    def test_andere_fehler_sofort(self):
        pausen = []

        def scan():
            raise ValueError("kaputt")

        with self.assertRaises(ValueError):
            mit_wiederholung(scan, lambda _: None, sleep=pausen.append)
        self.assertEqual(pausen, [])


if __name__ == "__main__":
    unittest.main()
