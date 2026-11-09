# Lernassistent

Lädt Folien und Materialien deiner Module aus Stud.IP in das Studium Vault.

## Einrichtung (einmalig)

```bash
cd ~/StudHack/Lernassistent
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env
chmod 600 .env
```

Danach `.env` öffnen und Uni-Kennung und Passwort eintragen.

## Benutzung

```bash
.venv/bin/python -m scanner.scan --auth-test      # Anmeldung prüfen
.venv/bin/python -m scanner.scan --list-courses   # alle belegten Kurse mit ID
.venv/bin/python -m scanner.scan --dry-run        # nur anzeigen, was neu ist
.venv/bin/python -m scanner.scan                  # neue Dateien herunterladen
.venv/bin/python -m scanner.scan --modul IuF      # nur ein Modul
```

Downloads landen in `Studium Vault/06 Anhänge/<Kürzel>/`, der Bericht in `reports/`.

### Täglicher Scan

```bash
scripts/scan_einrichten.sh                               # täglich 07:30 einrichten
launchctl kickstart -k gui/$(id -u)/de.studhack.scan     # sofort einmal ausführen
scripts/scan_einrichten.sh --entfernen                   # wieder abschalten
```

Bei neuen Dateien kommt eine macOS-Mitteilung, sonst bleibt es still. Protokoll in
`logs/scan.log`. Voraussetzung: Uni-Kennung und Passwort in `.env` (ein
Sitzungs-Cookie läuft ab). Verpasste Läufe holt macOS beim Aufwachen nach.

## Wochenbefehl

Nachdem die neuen Wochennotizen geschrieben sind:

```bash
.venv/bin/python -m wochenlauf
```

Zeigt erst, was neu ist (Karten, Notizen, Bilder, Notizen ohne Auswahlfragen samt
geschätzter Kosten), fragt dann und führt Importer, Lesemodus-Import und Generator
nacheinander aus. `--ohne-fragen` lässt die Auswahlfragen weg.

## Importer

Überträgt Karteikarten und Verständnisfragen aus den Wochennotizen nach Supabase.
Vorher in `.env` die Supabase-Werte eintragen (siehe `.env.example`).

```bash
.venv/bin/python -m importer.import_notes                              # Trockenlauf, alle Notizen
.venv/bin/python -m importer.import_notes --notiz "IuF W02"            # nur eine Notiz
.venv/bin/python -m importer.import_notes --notiz "IuF W02" --schreiben  # wirklich hochladen
.venv/bin/python -m importer.import_notes --schreiben                  # alle Notizen hochladen
```

Ohne `--schreiben` wird nichts verändert. Ein erneuter Lauf legt keine Doppelten an.
