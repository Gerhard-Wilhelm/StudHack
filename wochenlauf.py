"""Wochenbefehl: bringt neue oder geänderte Wochennotizen in einem Rutsch in die App.

Erst eine Vorschau (liest nur, kostet nichts), dann nach Rückfrage der Reihe nach:
  1. importer.import_notes --schreiben       Karteikarten und Verständnisfragen
  2. importer.import_lesemodus --schreiben   Notizen, Modulinfos, Folienbilder
  3. generator.generate_mc --schreiben       Auswahlfragen als Entwürfe (Claude API)

Aufruf (im Ordner Lernassistent):
  .venv/bin/python -m wochenlauf                 # Vorschau, dann Rückfrage
  .venv/bin/python -m wochenlauf --ohne-fragen   # ohne Auswahlfragen
  .venv/bin/python -m wochenlauf --ja            # ohne Rückfrage

Schlägt ein Schritt fehl, laufen die anderen trotzdem. Ein erneuter Aufruf erledigt nur, was fehlt.
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

import yaml

from generator.generate_mc import Generator, anzahl
from importer import import_lesemodus as lesemodus
from importer.import_notes import PROJECT_DIR, aenderungen, find_notes, lese_alle

KOSTEN_JE_NOTIZ = 0.15  # Dollar, grob nach den bisherigen Läufen


class Vorschau(lesemodus.Lesemodus, Generator):
    """Eine Anmeldung für alle Lesezugriffe der Vorschau."""


def bilder_neu(bilder: dict[str, lesemodus.Bild], manifest: dict[str, str]) -> list[str]:
    """Bilder, die noch nicht oder in anderer Fassung hochgeladen sind."""
    return [pfad for pfad, b in bilder.items() if manifest.get(pfad) != lesemodus.datei_hash(b.quelle)]


def teil(titel: str, fn) -> None:
    """Ein Abschnitt der Vorschau. Fehlt etwas (z. B. Migration), steht das da statt eines Abbruchs."""
    try:
        zeilen = fn()
    except SystemExit as e:
        zeilen = [f"nicht verfügbar: {e.code}"]
    print(f"\n{titel}")
    for z in zeilen:
        print(f"  {z}")


def vorschau(cfg: dict, vault: Path, db: Vorschau, mit_fragen: bool) -> None:
    def karten():
        neu, geaendert = aenderungen(lese_alle(vault), db.existing())
        return [f"{len(neu)} neu, {len(geaendert)} geändert"]

    def lesen():
        notizen = [n for n in (lesemodus.parse_note(p, vault) for p in find_notes(vault, None, None)) if n]
        module = [m for m in (lesemodus.parse_overview(p, vault) for p in lesemodus.find_overviews(vault, None)) if m]
        vorhanden = db.existing_notes()
        n_neu = sum(1 for n in notizen if n.notiz not in vorhanden)
        n_geaendert = sum(1 for n in notizen if n.notiz in vorhanden and vorhanden[n.notiz] != n.hash)
        vorhandene_module = db.existing_modules()
        m_geaendert = sum(1 for m in module if vorhandene_module.get(m.modul) != m.hash)
        manifest = json.loads(lesemodus.MANIFEST.read_text()) if lesemodus.MANIFEST.exists() else {}
        bilder = {b.pfad: b for x in [*notizen, *module] for b in x.bilder}
        return [f"Notizen: {n_neu} neu, {n_geaendert} geändert",
                f"Modulinfos: {m_geaendert} neu oder geändert",
                f"Bilder: {len(bilder_neu(bilder, manifest))} hochzuladen"]

    def fragen():
        fertig = db.bearbeitete_notizen()
        offen = [n for n in (lesemodus.parse_note(p, vault) for p in find_notes(vault, None, None))
                 if n and n.notiz not in fertig and sum(anzahl(cfg, n.modul)) > 0]
        if not offen:
            return ["alle Notizen haben schon Auswahlfragen"]
        return [f"{n.modul} W{n.woche:02d} {n.titel}" for n in offen] + [
            f"{len(offen)} Notizen, geschätzt etwa {len(offen) * KOSTEN_JE_NOTIZ:.2f} Dollar"]

    teil("Karteikarten und Verständnisfragen", karten)
    teil("Lesemodus", lesen)
    if mit_fragen:
        teil("Auswahlfragen (Claude API)", fragen)


def main() -> int:
    p = argparse.ArgumentParser(description="Neue Wochennotizen in die App bringen")
    p.add_argument("--ohne-fragen", action="store_true", help="keine Auswahlfragen erzeugen")
    p.add_argument("--ja", action="store_true", help="ohne Rückfrage ausführen")
    args = p.parse_args()

    cfg = yaml.safe_load((PROJECT_DIR / "config.yaml").read_text(encoding="utf-8"))
    vault = Path(cfg["vault"]).expanduser()

    print("Vorschau (liest nur, schreibt nichts):")
    vorschau(cfg, vault, Vorschau(), not args.ohne_fragen)

    if not args.ja:
        if not sys.stdin.isatty():
            print("\nKeine Rückfrage möglich, zum Ausführen mit --ja aufrufen.")
            return 1
        if input("\nWeiter? (j/n) ").strip().lower() not in ("j", "ja"):
            print("Abgebrochen, nichts geschrieben.")
            return 0

    schritte = [("Karteikarten", "importer.import_notes"), ("Lesemodus", "importer.import_lesemodus")]
    if not args.ohne_fragen:
        schritte.append(("Auswahlfragen", "generator.generate_mc"))

    ergebnis = []
    for name, modul in schritte:
        print(f"\n=== {name} ===", flush=True)
        code = subprocess.run([sys.executable, "-m", modul, "--schreiben"], cwd=PROJECT_DIR).returncode
        ergebnis.append((name, code))

    print("\nZusammenfassung:")
    for name, code in ergebnis:
        print(f"  {name}: {'fertig' if code == 0 else f'Fehler (Code {code}), erneut aufrufen holt es nach'}")
    if not args.ohne_fragen:
        print("Neue Auswahlfragen gibst du in der App unter \"Entwürfe prüfen\" frei.")
    return 0 if all(code == 0 for _, code in ergebnis) else 1


if __name__ == "__main__":
    sys.exit(main())
