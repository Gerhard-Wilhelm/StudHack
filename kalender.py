"""Schreibt den Lernplan aus der App in den Vault: 02 Lernplan/Kalender.md.

Liest die Lernblöcke der laufenden und der nächsten zwei Wochen aus Supabase (nur lesend)
und erzeugt daraus die Notiz. Läuft automatisch beim täglichen Scan und bei wochenlauf.

Aufruf (im Ordner Lernassistent):
  .venv/bin/python -m kalender
"""

import sys
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path

import yaml

from importer.import_notes import PROJECT_DIR, Supabase

WOCHEN = 3
WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]
ZIEL = Path("02 Lernplan") / "Kalender.md"


class Kalender(Supabase):
    def blocks(self, von: date, bis: date) -> list[dict]:
        r = self._check(self.s.get(f"{self.url}/rest/v1/study_blocks", params={
            "select": "module,day,start_time,duration_min,done",
            "and": f"(day.gte.{von.isoformat()},day.lte.{bis.isoformat()})",
            "order": "day,start_time"}, timeout=30))
        return r.json()


def ende(start: str, minuten: int) -> str:
    t = datetime.strptime(start[:5], "%H:%M") + timedelta(minutes=minuten)
    return t.strftime("%H:%M")


def stunden(h: float) -> str:
    return f"{h:g}".replace(".", ",") + " h"


def notiz(blocks: list[dict], montag: date, namen: dict[str, str], heute: date, wochen: int = WOCHEN) -> str:
    """Markdown der Kalender-Notiz. Rein, ohne Zugriff auf Supabase, damit testbar."""
    nach_tag = defaultdict(list)
    for b in blocks:
        nach_tag[b["day"]].append(b)

    zeilen = [
        "---", "tags: [lernplan]", "status: aktiv", f"date: {heute.isoformat()}", "---", "",
        "# Kalender", "",
        "Automatisch erzeugt aus dem Lernplan in der App (Seite \"Plan\"). Änderungen bitte in der App machen,",
        "diese Notiz wird beim täglichen Scan und bei `wochenlauf` überschrieben. Zurück zum [[Wochenplan]].",
    ]
    for w in range(wochen):
        start = montag + timedelta(weeks=w)
        tage = [start + timedelta(days=i) for i in range(7)]
        kw = start.isocalendar().week
        titel = "Diese Woche" if w == 0 else "Nächste Woche" if w == 1 else f"In {w} Wochen"
        zeilen += ["", f"## KW {kw}: {start:%d.%m.} bis {tage[-1]:%d.%m.%Y} ({titel})", "",
                   "| Tag | Lernblöcke |", "|---|---|"]
        summe: dict[str, float] = defaultdict(float)
        for i, tag in enumerate(tage):
            eintraege = []
            for b in sorted(nach_tag.get(tag.isoformat(), []), key=lambda x: x["start_time"]):
                text = f"{b['start_time'][:5]} bis {ende(b['start_time'], b['duration_min'])} **{b['module']}**"
                if b["done"]:
                    text += " (erledigt)"
                eintraege.append(text)
                summe[b["module"]] += b["duration_min"] / 60
            name = f"**{WOCHENTAGE[i]} {tag:%d.%m.}**" if tag == heute else f"{WOCHENTAGE[i]} {tag:%d.%m.}"
            zeilen.append(f"| {name} | {', '.join(eintraege) if eintraege else 'frei'} |")
        if summe:
            teile = [f"{m} ({namen[m]}) {stunden(h)}" if namen.get(m, m) != m else f"{m} {stunden(h)}"
                     for m, h in sorted(summe.items(), key=lambda x: (-x[1], x[0]))]
            zeilen += ["", f"Geplant: {stunden(sum(summe.values()))}. " + ", ".join(teile) + "."]
        else:
            zeilen += ["", "Noch nichts geplant."]
    return "\n".join(zeilen) + "\n"


def schreiben(heute: date | None = None) -> Path:
    """Holt die Blöcke und schreibt die Notiz. Gibt den Pfad zurück."""
    heute = heute or date.today()
    cfg = yaml.safe_load((PROJECT_DIR / "config.yaml").read_text(encoding="utf-8"))
    vault = Path(cfg["vault"]).expanduser()
    namen = {k: (v or {}).get("name", k) for k, v in cfg.get("module", {}).items()}
    montag = heute - timedelta(days=heute.weekday())
    blocks = Kalender().blocks(montag, montag + timedelta(weeks=WOCHEN, days=-1))
    ziel = vault / ZIEL
    ziel.write_text(notiz(blocks, montag, namen, heute), encoding="utf-8")
    return ziel


def main() -> int:
    ziel = schreiben()
    print(f"Kalender geschrieben: {ziel}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
