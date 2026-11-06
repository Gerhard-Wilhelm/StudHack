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
import yaml

from .client import PROJECT_DIR, AuthError, StudIP
from .extract import pdf_to_text

STATE_FILE = PROJECT_DIR / "state" / "state.json"
TEXT_DIR = PROJECT_DIR / "cache" / "text"
REPORT_DIR = PROJECT_DIR / "reports"


def load_config() -> dict:
    return yaml.safe_load((PROJECT_DIR / "config.yaml").read_text(encoding="utf-8"))


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

        modules = cfg["module"]
        if args.modul:
            if args.modul not in modules:
                print(f"Unbekanntes Modul {args.modul}. Verfügbar: {', '.join(modules)}")
                return 1
            modules = {args.modul: modules[args.modul]}

        attach_dir = Path(cfg["vault"]).expanduser() / "06 Anhänge"
        state = load_state()
        found = []
        for kuerzel, modul in modules.items():
            if not modul.get("kurse"):
                print(f"{kuerzel}: keine Kurs-IDs in config.yaml, übersprungen")
                continue
            items = scan_module(api, kuerzel, modul, state, attach_dir, args.dry_run)
            print(f"{kuerzel}: {len(items)} neue oder geänderte Dateien")
            for f in items:
                print(f"  [{f['status']}] {f['ordner']} / {f['name']}")
            found += items
            if not args.dry_run:
                save_state(state)
    except AuthError as e:
        print(f"Fehler: {e}")
        return 2

    if found and not args.dry_run:
        print(f"Bericht: {write_report(found, cfg['module'])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
