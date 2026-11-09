"""Geplanter Scan für launchd: lädt Neues aus Stud.IP und meldet es als macOS-Mitteilung.

Ohne Neues bleibt es still. Die Ausgabe jedes Laufs landet in logs/scan.log.
Einrichten: scripts/scan_einrichten.sh, von Hand testen: .venv/bin/python -m scanner.auto
"""

import subprocess
import sys
import traceback
from collections import Counter
from datetime import datetime

from .client import PROJECT_DIR, AuthError, StudIP
from .scan import load_config, run

LOG_FILE = PROJECT_DIR / "logs" / "scan.log"
TITEL = "StudHack Scanner"


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
            found, report = run(cfg, StudIP(cfg["studip_url"]), log=log)
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
