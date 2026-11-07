"""Überträgt Karteikarten und Verständnisfragen aus den Wochennotizen nach Supabase.

Standard ist ein Trockenlauf: Es wird nur angezeigt, was importiert würde.
Erst mit --schreiben werden Daten in Supabase angelegt oder geändert.

Aufruf (im Ordner Lernassistent):
  .venv/bin/python -m importer.import_notes                     # Trockenlauf, alle Notizen
  .venv/bin/python -m importer.import_notes --notiz "IuF W02"   # nur Notizen, deren Name so beginnt
  .venv/bin/python -m importer.import_notes --modul IuF         # nur ein Modul
  .venv/bin/python -m importer.import_notes --schreiben         # wirklich hochladen

Bereits importierte Lernobjekte werden erkannt (gleiches Modul, gleicher Typ, gleiche
Frage). Ihre Lösung und Quelle werden aktualisiert, ihr Status bleibt unverändert.
"""

import argparse
import hashlib
import os
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

import yaml

PROJECT_DIR = Path(__file__).resolve().parent.parent

NOTE_NAME = re.compile(r"^(?P<modul>\S+) W(?P<woche>\d{2}) ")
QUESTION_LINE = re.compile(r"^\*\*(\d+)\.\s*(?P<frage>.+?)\*\*\s*$")
CALLOUT_START = re.compile(r"^>\s*\[!question\]-")
PDF_SOURCE = re.compile(r"\[\[([^\]|#]+?\.pdf)#page=(\d+)")


@dataclass
class Item:
    modul: str
    woche: int
    typ: str
    frage: str
    loesung: str
    notiz: str
    quelle_datei: str | None = None
    quelle_seite: int | None = None
    hash: str = field(init=False)

    def __post_init__(self):
        m = PDF_SOURCE.search(self.loesung) or PDF_SOURCE.search(self.frage)
        if m:
            self.quelle_datei, self.quelle_seite = m.group(1), int(m.group(2))
        normiert = " ".join(self.frage.split())
        self.hash = hashlib.sha256(f"{self.modul}|{self.typ}|{normiert}".encode()).hexdigest()

    def als_zeile(self) -> dict:
        return {
            "module": self.modul,
            "week": self.woche,
            "type": self.typ,
            "question": self.frage,
            "answer": self.loesung,
            "source_file": self.quelle_datei,
            "source_page": self.quelle_seite,
            "origin": "import",
            "origin_ref": self.notiz,
            "content_hash": self.hash,
        }


def sections(text: str) -> dict[str, list[str]]:
    """Teilt eine Notiz an den Überschriften der Ebene 2."""
    result, current = {}, None
    for line in text.splitlines():
        if line.startswith("## "):
            current = line[3:].strip()
            result[current] = []
        elif current:
            result[current].append(line)
    return result


def karteikarten(lines: list[str]) -> list[tuple[str, str]]:
    cards = []
    for line in lines:
        if "::" in line and not line.lstrip().startswith("#"):
            frage, loesung = line.split("::", 1)
            if frage.strip() and loesung.strip():
                cards.append((frage.strip(), loesung.strip()))
    return cards


def verstaendnisfragen(lines: list[str]) -> list[tuple[str, str]]:
    """Fett nummerierte Frage, darunter eingeklappter Callout mit der Lösung."""
    result, frage, loesung, im_callout = [], None, [], False

    def abschliessen():
        if frage and loesung:
            result.append((frage, "\n".join(loesung).strip()))

    for line in lines:
        m = QUESTION_LINE.match(line)
        if m:
            abschliessen()
            frage, loesung, im_callout = m.group("frage").strip(), [], False
        elif CALLOUT_START.match(line):
            im_callout = True
        elif im_callout and line.startswith(">"):
            loesung.append(line[1:].removeprefix(" "))
        elif im_callout and not line.strip():
            im_callout = False
    abschliessen()
    return result


def parse_note(path: Path, vault: Path) -> list[Item]:
    m = NOTE_NAME.match(path.stem)
    if not m:
        return []
    modul, woche = m.group("modul"), int(m.group("woche"))
    notiz = str(path.relative_to(vault))
    secs = sections(path.read_text(encoding="utf-8"))
    items = [Item(modul, woche, "karteikarte", f, l, notiz) for f, l in karteikarten(secs.get("Karteikarten", []))]
    items += [Item(modul, woche, "verstaendnisfrage", f, l, notiz) for f, l in verstaendnisfragen(secs.get("Verständnisfragen", []))]
    return items


def find_notes(vault: Path, modul: str | None, notiz: str | None) -> list[Path]:
    notes = sorted((vault / "01 Module").glob("*/* W[0-9][0-9] *.md"))
    if modul:
        notes = [n for n in notes if n.stem.split(" ")[0] == modul]
    if notiz:
        notes = [n for n in notes if n.stem.startswith(notiz)]
    return notes


class Supabase:
    """Minimaler REST-Zugriff. Meldet sich als Gerhard an, damit die Zugriffsregeln greifen."""

    def __init__(self):
        import requests
        from dotenv import load_dotenv

        load_dotenv(PROJECT_DIR / ".env")
        self.url = os.getenv("SUPABASE_URL", "").rstrip("/")
        key = os.getenv("SUPABASE_KEY", "")
        email, password = os.getenv("STUDHACK_EMAIL", ""), os.getenv("STUDHACK_PASSWORD", "")
        if not all([self.url, key, email, password]):
            sys.exit("SUPABASE_URL, SUPABASE_KEY, STUDHACK_EMAIL und STUDHACK_PASSWORD fehlen in .env (siehe .env.example).")
        self.s = requests.Session()
        self.s.headers["apikey"] = key
        r = self.s.post(f"{self.url}/auth/v1/token?grant_type=password", json={"email": email, "password": password}, timeout=30)
        if r.status_code != 200:
            sys.exit(f"Anmeldung bei Supabase fehlgeschlagen ({r.status_code}).")
        self.s.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
        self.user_id = r.json()["user"]["id"]

    def _check(self, r):
        if r.status_code >= 300:
            sys.exit(f"Supabase-Fehler {r.status_code}: {r.text[:300]}")
        return r

    def existing(self) -> dict[str, dict]:
        rows, offset = [], 0
        while True:
            r = self._check(self.s.get(f"{self.url}/rest/v1/items", params={
                "select": "id,content_hash,origin,answer,source_file,source_page,week,origin_ref",
                "limit": 1000, "offset": offset}, timeout=30))
            batch = r.json()
            rows += batch
            if len(batch) < 1000:
                return {row["content_hash"]: row for row in rows}
            offset += 1000

    def insert(self, items: list[Item]) -> None:
        for i in range(0, len(items), 200):
            rows = [dict(it.als_zeile(), status="freigegeben") for it in items[i:i + 200]]
            r = self._check(self.s.post(f"{self.url}/rest/v1/items", params={"select": "id"}, json=rows,
                                        headers={"Prefer": "return=representation"}, timeout=60))
            states = [{"item_id": row["id"]} for row in r.json()]
            self._check(self.s.post(f"{self.url}/rest/v1/card_states", json=states, timeout=60))

    def update(self, row_id: int, item: Item) -> None:
        z = item.als_zeile()
        patch = {k: z[k] for k in ("answer", "source_file", "source_page", "week", "origin_ref")}
        self._check(self.s.patch(f"{self.url}/rest/v1/items", params={"id": f"eq.{row_id}"}, json=patch, timeout=30))


def main() -> int:
    p = argparse.ArgumentParser(description="Wochennotizen nach Supabase übertragen")
    p.add_argument("--modul", help="nur dieses Modul (Kürzel, z. B. IuF)")
    p.add_argument("--notiz", help='nur Notizen, deren Name so beginnt, z. B. "IuF W02"')
    p.add_argument("--schreiben", action="store_true", help="wirklich in Supabase schreiben (ohne: Trockenlauf)")
    args = p.parse_args()

    cfg = yaml.safe_load((PROJECT_DIR / "config.yaml").read_text(encoding="utf-8"))
    vault = Path(cfg["vault"]).expanduser()
    notes = find_notes(vault, args.modul, args.notiz)
    if not notes:
        print("Keine passenden Wochennotizen gefunden.")
        return 1

    items, seen = [], set()
    for note in notes:
        parsed, dup = [], 0
        for it in parse_note(note, vault):
            if it.hash in seen:
                dup += 1
            else:
                seen.add(it.hash)
                parsed.append(it)
        items += parsed
        k = sum(it.typ == "karteikarte" for it in parsed)
        v = sum(it.typ == "verstaendnisfrage" for it in parsed)
        ohne = sum(it.quelle_seite is None for it in parsed)
        hinweis = f", {ohne} ohne PDF-Seite" if ohne else ""
        hinweis += f", {dup} doppelt übersprungen" if dup else ""
        print(f"{note.stem}: {k} Karteikarten, {v} Verständnisfragen{hinweis}")

    print(f"\nGesamt: {len(items)} Lernobjekte aus {len(notes)} Notizen")

    if not args.schreiben:
        for it in items[:2]:
            print(f"\nBeispiel ({it.typ}, {it.modul} W{it.woche}, Quelle {it.quelle_datei} S. {it.quelle_seite}):")
            print(f"  Frage:  {it.frage[:120]}")
            print(f"  Lösung: {it.loesung[:120]}")
        print("\nTrockenlauf, nichts geschrieben. Zum Hochladen mit --schreiben aufrufen.")
        return 0

    db = Supabase()
    existing = db.existing()
    neu = [it for it in items if it.hash not in existing]
    geaendert = [(existing[it.hash]["id"], it) for it in items if it.hash in existing
                 and existing[it.hash]["origin"] == "import"
                 and any(existing[it.hash][k] != v for k, v in it.als_zeile().items()
                         if k in ("answer", "source_file", "source_page", "week", "origin_ref"))]
    db.insert(neu)
    for row_id, it in geaendert:
        db.update(row_id, it)
    print(f"Neu angelegt: {len(neu)}, aktualisiert: {len(geaendert)}, unverändert: {len(items) - len(neu) - len(geaendert)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
