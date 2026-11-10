"""Tests ohne Supabase. Aufruf: .venv/bin/python -m unittest test_kalender"""

import unittest
from datetime import date

from kalender import ende, notiz


class KalenderTest(unittest.TestCase):
    def test_ende(self):
        self.assertEqual(ende("18:00:00", 120), "20:00")
        self.assertEqual(ende("20:30", 120), "22:30")

    def test_notiz(self):
        blocks = [
            {"module": "BIL", "day": "2026-11-10", "start_time": "18:00:00", "duration_min": 120, "done": True},
            {"module": "MAK", "day": "2026-11-10", "start_time": "10:00:00", "duration_min": 120, "done": False},
            {"module": "BIL", "day": "2026-11-18", "start_time": "14:00:00", "duration_min": 120, "done": False},
        ]
        t = notiz(blocks, date(2026, 11, 9), {"BIL": "Bilanzierung"}, heute=date(2026, 11, 10), wochen=2)
        self.assertIn("## KW 46: 09.11. bis 15.11.2026 (Diese Woche)", t)
        self.assertIn("## KW 47: 16.11. bis 22.11.2026 (Nächste Woche)", t)
        self.assertIn("| **Di 10.11.** | 10:00 bis 12:00 **MAK**, 18:00 bis 20:00 **BIL** (erledigt) |", t)
        self.assertIn("| Mo 09.11. | frei |", t)
        self.assertIn("Geplant: 4 h. BIL (Bilanzierung) 2 h, MAK 2 h.", t)
        self.assertIn("| Mi 18.11. | 14:00 bis 16:00 **BIL** |", t)
        self.assertNotIn("–", t)


if __name__ == "__main__":
    unittest.main()
