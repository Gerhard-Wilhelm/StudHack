"""Gleicht Stud.IP mit dem lokalen Stand ab und lädt neue Dateien herunter.

Aufruf: python -m scanner.scan [--dry-run] [--modul KÜRZEL] [--auth-test] [--list-courses]
"""

import argparse
import json
import re
import sys
from datetime import date
from pathlib import Path

import requests

from .client import PROJECT_DIR, AuthError, StudIP
from .extract import pdf_to_text
from konfig import lade_config

STATE_FILE = PROJECT_DIR / "state" / "state.json"
TEXT_DIR = PROJECT_DIR / "cache" / "text"
REPORT_DIR = PROJECT_DIR / "reports"


def load_config() -> dict:
    return lade_config()


def load_state() -> dict:
    return json.loads(STATE_FILE.read_text(encoding="utf-8")) if STATE_FILE.exists() else {}


def save_state(state: dict) -> None:
    STATE_FILE.parent.mkdir(exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")


def safe_name(name: str) -> str:
    return re.sub(r'[/\\:*?"<>|]', "_", name).strip()


def target_path(folder: Path, name: str, changed: str) -> Path:
    """Bestehende Dateien nie überschreiben, sondern Datum anhängen."""
    target = folder / safe_name(name)
    if target.exists():
        target = target.with_name(f"{target.stem} ({changed[:10]}){target.suffix}")
    return target


def scan_module(api: StudIP, kuerzel: str, modul: dict, state: dict, attach_dir: Path, dry_run: bool) -> list[dict]:
    found = []
    for course_id in modul.get("kurse") or []:
        course = api.course_title(course_id)
        folders = api.folders(course_id)
        for ref in api.file_refs(course_id):
            a = ref["attributes"]
            known = state.get(ref["id"])
            if known and known["chdate"] == a["chdate"]:
                continue
            parent = ref.get("relationships", {}).get("parent", {}).get("data") or {}
            entry = {
                "modul": kuerzel,
                "kurs": course,
                "ordner": folders.get(parent.get("id"), ""),
                "name": a["name"],
                "chdate": a["chdate"],
                "status": "geändert" if known else "neu",
            }
            if not dry_run:
                folder = attach_dir / kuerzel
                folder.mkdir(parents=True, exist_ok=True)
                target = target_path(folder, a["name"], a["chdate"])
                try:
                    api.download(ref["id"], target)
                except requests.HTTPError as e:
                    # z. B. Link-Einträge ohne Inhalt; nicht in den State, damit der nächste Lauf es erneut versucht
                    entry["status"] = f"nicht ladbar ({e.response.status_code})"
                    found.append(entry)
                    continue
                pdf_to_text(target, TEXT_DIR / kuerzel)
                entry["datei"] = target.name
                state[ref["id"]] = {"name": a["name"], "chdate": a["chdate"], "datei": str(target)}
            found.append(entry)
    return found


def write_report(found: list[dict], modules: dict) -> Path:
    REPORT_DIR.mkdir(exist_ok=True)
    report = REPORT_DIR / f"{date.today().isoformat()} Neue Materialien.md"
    # Mehrere Läufe am selben Tag: an den bestehenden Bericht anhängen
    lines = [report.read_text(encoding="utf-8").rstrip("\n"), ""] if report.exists() else [f"# Neue Materialien {date.today().isoformat()}", ""]
    for kuerzel in modules:
        items = [f for f in found if f["modul"] == kuerzel]
        if not items:
            continue
        lines += [f"## {kuerzel} {modules[kuerzel]['name']}", "", "| Status | Kurs | Ordner | Datei | Geändert |", "|---|---|---|---|---|"]
        lines += [f"| {f['status']} | {f['kurs']} | {f['ordner']} | {f.get('datei', f['name'])} | {f['chdate'][:10]} |" for f in items]
        lines.append("")
    report.write_text("\n".join(lines), encoding="utf-8")
    return report


def run(cfg: dict, api: StudIP, modul: str | None = None, dry_run: bool = False,
        log=print) -> tuple[list[dict], Path | None]:
    """Gleicht alle (oder ein) Modul ab. Gibt die gefundenen Dateien und den Bericht zurück.

    Wirft AuthError, wenn die Anmeldung scheitert, und ValueError bei unbekanntem Modul.
    """
    modules = cfg["module"]
    if modul:
        if modul not in modules:
            raise ValueError(f"Unbekanntes Modul {modul}. Verfügbar: {', '.join(modules)}")
        modules = {modul: modules[modul]}

    attach_dir = Path(cfg["vault"]).expanduser() / "06 Anhänge"
    state = load_state()
    found = []
    for kuerzel, m in modules.items():
        if not m.get("kurse"):
            log(f"{kuerzel}: keine Kurs-IDs in config.yaml, übersprungen")
            continue
        items = scan_module(api, kuerzel, m, state, attach_dir, dry_run)
        log(f"{kuerzel}: {len(items)} neue oder geänderte Dateien")
        for f in items:
            log(f"  [{f['status']}] {f['ordner']} / {f['name']}")
        found += items
        if not dry_run:
            save_state(state)

    report = write_report(found, cfg["module"]) if found and not dry_run else None
    return found, report


def main() -> int:
    p = argparse.ArgumentParser(description="Stud.IP Materialien ins Studium Vault laden")
    p.add_argument("--dry-run", action="store_true", help="nur anzeigen, nichts herunterladen")
    p.add_argument("--modul", help="nur dieses Modul (Kürzel aus config.yaml)")
    p.add_argument("--auth-test", action="store_true", help="nur die Anmeldung prüfen")
    p.add_argument("--list-courses", action="store_true", help="alle belegten Kurse mit ID anzeigen")
    args = p.parse_args()

    cfg = load_config()
    try:
        api = StudIP(cfg["studip_url"])
        if args.auth_test:
            me = api.me()["attributes"]
            print(f"Anmeldung erfolgreich ({api.auth_mode}) als {me.get('formatted-name', me.get('username'))}.")
            return 0
        if args.list_courses:
            for c in api.my_courses():
                print(f"{c['id']}  {c['attributes']['title']}")
            return 0

        _, report = run(cfg, api, args.modul, args.dry_run)
    except ValueError as e:
        print(e)
        return 1
    except AuthError as e:
        print(f"Fehler: {e}")
        return 2

    if report:
        print(f"Bericht: {report}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
