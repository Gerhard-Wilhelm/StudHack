"""Liest config.yaml. Fehlt sie, kommt ein Hinweis auf die Beispieldatei statt eines Tracebacks."""

from pathlib import Path

import yaml

PROJECT_DIR = Path(__file__).resolve().parent
CONFIG_FILE = PROJECT_DIR / "config.yaml"


class KonfigFehlt(SystemExit):
    pass


def lade_config(datei: Path = CONFIG_FILE) -> dict:
    if not datei.exists():
        raise KonfigFehlt(
            f"{datei.name} fehlt. Kopiere config.example.yaml nach config.yaml und trage deine Module ein:\n"
            "  cp config.example.yaml config.yaml"
        )
    return yaml.safe_load(datei.read_text(encoding="utf-8")) or {}
