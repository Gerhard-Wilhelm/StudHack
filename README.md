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
