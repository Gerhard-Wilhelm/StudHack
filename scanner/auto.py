"""Geplanter Scan für launchd: lädt Neues aus Stud.IP und meldet es als macOS-Mitteilung.

Ohne Neues bleibt es still. Die Ausgabe jedes Laufs landet in logs/scan.log.
Ist beim Start noch kein Netz da (typisch direkt nach dem Aufwachen des Macs), wartet
der Scan und versucht es nach 2, 5 und 10 Minuten erneut.
Einrichten: scripts/scan_einrichten.sh, von Hand testen: .venv/bin/python -m scanner.auto
"""

import subprocess
import sys
import time
import traceback
from collections import Counter
from datetime import datetime

import requests

from .client import PROJECT_DIR, AuthError, StudIP
from .scan import load_config, run

LOG_FILE = PROJECT_DIR / "logs" / "scan.log"
TITEL = "StudHack Scanner"
# Pausen in Sekunden vor den Wiederholungen bei fehlendem Netz
WARTEN = (120, 300, 600)


def mit_wiederholung(fn, log, warten=WARTEN, sleep=time.sleep):
    """Führt fn aus und wiederholt bei Verbindungsfehlern nach den Pausen in warten.

    Der Scan speichert seinen Stand nach jedem Modul, ein erneuter Lauf setzt also sauber fort.
    """
    for versuch in range(len(warten) + 1):
        try:
            return fn()
        except requests.exceptions.ConnectionError as e:
            if versuch == len(warten):
                raise
            grund = type(e.__context__ or e).__name__
            log(f"Keine Verbindung zu Stud.IP ({grund}), neuer Versuch in {warten[versuch] // 60} Minuten")
            sleep(warten[versuch])


def meldung(found: list[dict], modul_reihenfolge: list[str]) -> str | None:
    """Kurzer Text für die Mitteilung, None wenn nichts Neues da ist."""
    geladen = [f for f in found if not f["status"].startswith("nicht ladbar")]
    if not geladen:
        return None
    je_modul = Counter(f["modul"] for f in geladen)
    teile = [f"{m} ({je_modul[m]})" for m in modul_reihenfolge if m in je_modul]
    n = len(geladen)
    return f"{n} neue {'Datei' if n == 1 else 'Dateien'}: {', '.join(teile)}"


def mitteilen(text: str, untertitel: str = "") -> None:
    """macOS-Mitteilung. Text als Argument, damit Anführungszeichen nichts kaputt machen."""
    script = [
        "on run argv",
        f'display notification (item 1 of argv) with title "{TITEL}" subtitle (item 2 of argv)',
        "end run",
    ]
    args = ["osascript"] + [x for line in script for x in ("-e", line)] + [text, untertitel]
    subprocess.run(args, check=False, capture_output=True)


def main() -> int:
    LOG_FILE.parent.mkdir(exist_ok=True)
    with LOG_FILE.open("a", encoding="utf-8") as log_file:
        def log(text: str) -> None:
            print(text)
            log_file.write(text + "\n")

        log(f"--- {datetime.now():%Y-%m-%d %H:%M} ---")
        try:
            cfg = load_config()
            found, report = mit_wiederholung(lambda: run(cfg, StudIP(cfg["studip_url"]), log=log), log)
        except AuthError as e:
            log(f"Anmeldung fehlgeschlagen: {e}")
            mitteilen("Stud.IP-Anmeldung fehlgeschlagen, bitte .env prüfen")
            return 2
        except Exception:
            log(traceback.format_exc())
            mitteilen("Scan fehlgeschlagen, Details in logs/scan.log")
            return 1

        text = meldung(found, list(cfg["module"]))
        if report:
            log(f"Bericht: {report}")
        if text:
            mitteilen(text, "Bericht in reports/")
        nicht_ladbar = [f for f in found if f["status"].startswith("nicht ladbar")]
        if nicht_ladbar:
            log(f"{len(nicht_ladbar)} Dateien nicht ladbar, siehe Bericht")
        return 0


if __name__ == "__main__":
    sys.exit(main())
