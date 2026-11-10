"""Überträgt Wochennotizen, Modulübersichten und Folienbilder für den Lesemodus nach Supabase.

Standard ist ein Trockenlauf: Es wird nur angezeigt, was hochgeladen würde.
Erst mit --schreiben werden Notizen in die Tabelle notes, Modulübersichten in
die Tabelle modules und Bilder in den privaten Bucket folien geschrieben.

Aufruf (im Ordner Lernassistent):
  .venv/bin/python -m importer.import_lesemodus                     # Trockenlauf, alle Notizen
  .venv/bin/python -m importer.import_lesemodus --notiz "IuF W02"   # nur Notizen, deren Name so beginnt
  .venv/bin/python -m importer.import_lesemodus --modul IuF         # nur ein Modul
  .venv/bin/python -m importer.import_lesemodus --schreiben         # wirklich hochladen

Die Notiz wird ohne Frontmatter, Titelzeile und Abschnitt "Karteikarten" übernommen
(die Karten liegen schon im Lernstapel). Von der Modulübersicht (<Modulname>.md im
Modulordner) fallen "Wochen" (listet die App selbst) und "Offene Fragen" weg. Eingebettete Bilder ![[<Bild>.png]] werden
verkleinert (JPEG, höchstens 1400 px breit) und als folien/<Kürzel>/<Bild>.jpg verlinkt.
Unveränderte Notizen und Bilder werden übersprungen. Ohne --modul und --notiz werden
Notizen aus der Datenbank entfernt, die es im Vault nicht mehr gibt (z. B. nach Umbenennung).
"""

import argparse
import hashlib
import json
import re
import subprocess
import sys
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

import yaml

from importer.import_notes import NOTE_NAME, PROJECT_DIR, Supabase, find_notes

BUCKET = "folien"
MAX_WIDTH = 1400
JPEG_QUALITY = 75
CACHE_DIR = PROJECT_DIR / "cache" / "folien"
MANIFEST = CACHE_DIR / "manifest.json"

IMAGE_EMBED = re.compile(r"!\[\[([^\]|]+?\.(?:png|jpe?g))(?:\|[^\]]*)?\]\]", re.IGNORECASE)
FRONTMATTER = re.compile(r"\A---\n.*?\n---\n", re.DOTALL)
QUELLE = re.compile(r'^quelle:\s*"?\[\[(?:.*/)?([^\]|#/]+?\.pdf)', re.MULTILINE)
KUERZEL = re.compile(r'^kuerzel:\s*"?([^"\n]+?)"?\s*$', re.MULTILINE)

OHNE_IN_NOTIZ = ("Karteikarten",)
OHNE_IN_UEBERSICHT = ("Wochen", "Offene Fragen")

UMLAUTE = str.maketrans({"ä": "ae", "ö": "oe", "ü": "ue", "Ä": "Ae", "Ö": "Oe", "Ü": "Ue", "ß": "ss"})


def slug(text: str) -> str:
    """Speicherpfade in Supabase vertragen keine Umlaute und Leerzeichen."""
    text = unicodedata.normalize("NFC", text).translate(UMLAUTE)
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^A-Za-z0-9._-]+", "-", text).strip("-")


@dataclass
class Bild:
    quelle: Path
    pfad: str  # im Bucket ohne user_id, z. B. IuF/BA02-S04.jpg


@dataclass
class Notiz:
    modul: str
    woche: int
    titel: str
    text: str
    quelle_datei: str | None
    notiz: str
    bilder: list[Bild]
    fehlend: list[str]
    hash: str = field(init=False)

    def __post_init__(self):
        self.hash = hashlib.sha256(f"{self.titel}\n{self.text}".encode()).hexdigest()

    def als_zeile(self, user_id: str) -> dict:
        return {
            "user_id": user_id,
            "module": self.modul,
            "week": self.woche,
            "title": self.titel,
            "body": self.text,
            "source_file": self.quelle_datei,
            "origin_ref": self.notiz,
            "content_hash": self.hash,
        }


@dataclass
class Modul:
    modul: str
    name: str
    text: str
    notiz: str
    bilder: list[Bild]
    fehlend: list[str]
    pruefung: str | None = None  # gewählter Klausurtermin aus config.yaml, ISO-Datum
    hash: str = field(init=False)

    def __post_init__(self):
        self.hash = hashlib.sha256(f"{self.name}\n{self.pruefung}\n{self.text}".encode()).hexdigest()

    def als_zeile(self, user_id: str) -> dict:
        return {
            "user_id": user_id,
            "module": self.modul,
            "name": self.name,
            "body": self.text,
            "exam_date": self.pruefung,
            "origin_ref": self.notiz,
            "content_hash": self.hash,
        }


def ohne_abschnitte(text: str, titel: tuple[str, ...]) -> str:
    """Entfernt Abschnitte der Ebene 2 samt Inhalt bis zur nächsten Überschrift dieser Ebene."""
    out, skip = [], False
    for line in text.splitlines():
        if line.startswith("## "):
            skip = line[3:].strip() in titel
        if not skip:
            out.append(line)
    return "\n".join(out)


def finde_bild(name: str, modul: str, anhaenge: Path) -> Path | None:
    for kandidat in (anhaenge / modul / "Folien" / name, anhaenge / modul / name):
        if kandidat.is_file():
            return kandidat
    treffer = sorted(anhaenge.rglob(Path(name).name))
    return treffer[0] if treffer else None


def aufbereiten(roh: str, modul: str, vault: Path, ohne: tuple[str, ...]) -> tuple[str, list[Bild], list[str]]:
    """Frontmatter, Titelzeile und die genannten Abschnitte weg, Bilder auf den Bucket umgebogen."""
    fm = FRONTMATTER.match(roh)
    text = roh[fm.end():] if fm else roh
    # Titelzeile weg, sie steht als eigenes Feld in der Tabelle
    text = re.sub(r"\A\s*# [^\n]*\n", "", text)
    text = ohne_abschnitte(text, ohne).strip() + "\n"

    anhaenge = vault / "06 Anhänge"
    bilder: dict[str, Bild] = {}
    fehlend: list[str] = []

    def ersetze(match: re.Match) -> str:
        name = match.group(1)
        datei = finde_bild(name, modul, anhaenge)
        if not datei:
            fehlend.append(name)
            return f"*Bild fehlt: {Path(name).stem}*"
        pfad = f"{slug(modul)}/{slug(datei.stem)}.jpg"
        bilder[pfad] = Bild(datei, pfad)
        return f"![{Path(name).stem}]({BUCKET}/{pfad})"

    return IMAGE_EMBED.sub(ersetze, text), list(bilder.values()), fehlend


def parse_note(path: Path, vault: Path) -> Notiz | None:
    m = NOTE_NAME.match(path.stem)
    if not m:
        return None
    modul, woche = m.group("modul"), int(m.group("woche"))
    roh = path.read_text(encoding="utf-8")
    fm = FRONTMATTER.match(roh)
    quelle = QUELLE.search(fm.group(0)) if fm else None
    text, bilder, fehlend = aufbereiten(roh, modul, vault, OHNE_IN_NOTIZ)
    titel = path.stem[m.end():].strip()
    return Notiz(modul, woche, titel, text, quelle.group(1) if quelle else None,
                 str(path.relative_to(vault)), bilder, fehlend)


def pruefung(cfg: dict | None, modul: str) -> str | None:
    """Gewählter Klausurtermin aus config.yaml (YAML liest ihn als Datum)."""
    wert = ((cfg or {}).get("module", {}).get(modul) or {}).get("pruefung")
    return str(wert) if wert else None


def parse_overview(path: Path, vault: Path, cfg: dict | None = None) -> Modul | None:
    """Übersichtsnotiz <Modulname>.md, das Kürzel steht im Frontmatter."""
    roh = path.read_text(encoding="utf-8")
    fm = FRONTMATTER.match(roh)
    kuerzel = KUERZEL.search(fm.group(0)) if fm else None
    if not kuerzel:
        return None
    modul = kuerzel.group(1).strip()
    text, bilder, fehlend = aufbereiten(roh, modul, vault, OHNE_IN_UEBERSICHT)
    return Modul(modul, path.stem, text, str(path.relative_to(vault)), bilder, fehlend, pruefung(cfg, modul))


def find_overviews(vault: Path, modul: str | None) -> list[Path]:
    pfade = [d / f"{d.name}.md" for d in sorted((vault / "01 Module").iterdir()) if (d / f"{d.name}.md").is_file()]
    module = [m for m in (parse_overview(p, vault) for p in pfade) if m]
    return [vault / m.notiz for m in module if not modul or m.modul == modul]


def datei_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verkleinern(bild: Bild) -> Path:
    """JPEG mit sips (macOS), höchstens MAX_WIDTH breit, kleine Bilder werden nicht vergrößert."""
    ziel = CACHE_DIR / bild.pfad
    ziel.parent.mkdir(parents=True, exist_ok=True)
    breite = subprocess.run(["sips", "-g", "pixelWidth", str(bild.quelle)],
                            capture_output=True, text=True, check=True).stdout
    w = int(re.search(r"pixelWidth:\s*(\d+)", breite).group(1))
    cmd = ["sips", "-s", "format", "jpeg", "-s", "formatOptions", str(JPEG_QUALITY)]
    if w > MAX_WIDTH:
        cmd += ["--resampleWidth", str(MAX_WIDTH)]
    subprocess.run(cmd + [str(bild.quelle), "--out", str(ziel)], capture_output=True, check=True)
    return ziel


class Lesemodus(Supabase):
    def existing_notes(self) -> dict[str, str]:
        r = self._check(self.s.get(f"{self.url}/rest/v1/notes", params={
            "select": "origin_ref,content_hash", "limit": 1000}, timeout=30))
        return {row["origin_ref"]: row["content_hash"] for row in r.json()}

    def upsert_notes(self, notizen: list[Notiz]) -> None:
        if not notizen:
            return
        self._check(self.s.post(
            f"{self.url}/rest/v1/notes", params={"on_conflict": "user_id,origin_ref"},
            json=[n.als_zeile(self.user_id) for n in notizen],
            headers={"Prefer": "resolution=merge-duplicates"}, timeout=60))

    def existing_modules(self) -> dict[str, str]:
        r = self._check(self.s.get(f"{self.url}/rest/v1/modules", params={
            "select": "module,content_hash", "limit": 1000}, timeout=30))
        return {row["module"]: row["content_hash"] for row in r.json()}

    def upsert_modules(self, module: list[Modul]) -> None:
        if not module:
            return
        self._check(self.s.post(
            f"{self.url}/rest/v1/modules", params={"on_conflict": "user_id,module"},
            json=[m.als_zeile(self.user_id) for m in module],
            headers={"Prefer": "resolution=merge-duplicates"}, timeout=60))

    def delete_note(self, origin_ref: str) -> None:
        self._check(self.s.delete(f"{self.url}/rest/v1/notes",
                                  params={"origin_ref": f"eq.{origin_ref}"}, timeout=30))

    def upload(self, pfad: str, datei: Path) -> None:
        self._check(self.s.post(
            f"{self.url}/storage/v1/object/{BUCKET}/{self.user_id}/{pfad}",
            data=datei.read_bytes(),
            headers={"Content-Type": "image/jpeg", "x-upsert": "true"}, timeout=120))


def main() -> int:
    p = argparse.ArgumentParser(description="Wochennotizen und Folienbilder für den Lesemodus nach Supabase")
    p.add_argument("--modul", help="nur dieses Modul (Kürzel, z. B. IuF)")
    p.add_argument("--notiz", help='nur Notizen, deren Name so beginnt, z. B. "IuF W02"')
    p.add_argument("--schreiben", action="store_true", help="wirklich hochladen (ohne: Trockenlauf)")
    args = p.parse_args()

    cfg = yaml.safe_load((PROJECT_DIR / "config.yaml").read_text(encoding="utf-8"))
    vault = Path(cfg["vault"]).expanduser()
    pfade = find_notes(vault, args.modul, args.notiz)
    # Mit --notiz geht es um einzelne Wochen, die Übersichten bleiben dann außen vor
    uebersichten = [] if args.notiz else find_overviews(vault, args.modul)
    if not pfade and not uebersichten:
        print("Keine passenden Notizen gefunden.")
        return 1

    notizen = [n for n in (parse_note(p, vault) for p in pfade) if n]
    module = [m for m in (parse_overview(p, vault, cfg) for p in uebersichten) if m]
    bilder = {b.pfad: b for x in [*notizen, *module] for b in x.bilder}
    for m in module:
        hinweis = f", {len(m.fehlend)} Bilder fehlen: {', '.join(m.fehlend)}" if m.fehlend else ""
        abschnitte = ", ".join(line[3:] for line in m.text.splitlines() if line.startswith("## "))
        termin = f", Klausur {m.pruefung}" if m.pruefung else ""
        print(f"Übersicht {m.modul} ({m.name}){termin}: {len(m.text) // 1000} Tsd. Zeichen, Abschnitte: {abschnitte}{hinweis}")
    for n in notizen:
        hinweis = f", {len(n.fehlend)} Bilder fehlen: {', '.join(n.fehlend)}" if n.fehlend else ""
        print(f"{n.modul} W{n.woche:02d} {n.titel}: {len(n.text) // 1000} Tsd. Zeichen, {len(n.bilder)} Bilder{hinweis}")
    groesse = sum(b.quelle.stat().st_size for b in bilder.values())
    print(f"\nGesamt: {len(module)} Übersichten, {len(notizen)} Notizen, {len(bilder)} Bilder "
          f"(Originale {groesse / 1e6:.1f} MB, werden verkleinert)")

    alle = not (args.modul or args.notiz)
    if not args.schreiben:
        print("\nTrockenlauf, nichts geschrieben. Zum Hochladen mit --schreiben aufrufen.")
        return 0

    db = Lesemodus()
    manifest = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    hochgeladen = 0
    for pfad, bild in sorted(bilder.items()):
        h = datei_hash(bild.quelle)
        if manifest.get(pfad) == h:
            continue
        db.upload(pfad, verkleinern(bild))
        manifest[pfad] = h
        hochgeladen += 1
        MANIFEST.parent.mkdir(parents=True, exist_ok=True)
        MANIFEST.write_text(json.dumps(manifest, indent=1, sort_keys=True))
        print(f"  Bild {hochgeladen}: {pfad}")

    vorhanden = db.existing_notes()
    geaendert = [n for n in notizen if vorhanden.get(n.notiz) != n.hash]
    db.upsert_notes(geaendert)
    # Nur bei einem Lauf über alle Notizen: was im Vault fehlt, ist umbenannt oder gelöscht
    verwaist = sorted(set(vorhanden) - {n.notiz for n in notizen}) if alle else []
    for ref in verwaist:
        db.delete_note(ref)
        print(f"  Notiz entfernt (nicht mehr im Vault): {ref}")
    vorhandene_module = db.existing_modules() if module else {}
    module_geaendert = [m for m in module if vorhandene_module.get(m.modul) != m.hash]
    db.upsert_modules(module_geaendert)
    print(f"Bilder hochgeladen: {hochgeladen}, unverändert: {len(bilder) - hochgeladen}")
    print(f"Notizen geschrieben: {len(geaendert)}, unverändert: {len(notizen) - len(geaendert)}, entfernt: {len(verwaist)}")
    print(f"Übersichten geschrieben: {len(module_geaendert)}, unverändert: {len(module) - len(module_geaendert)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
