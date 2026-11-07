# Lernkartei (PWA)

iPhone-App zum Abfragen der freigegebenen Lernobjekte mit FSRS.

## Einrichten

```bash
cd app
npm install
cp .env.example .env.local
```

In `.env.local` die Projekt-URL und den Publishable Key aus Supabase
eintragen (Project Settings, API). Die Datei bleibt lokal.

## Befehle

- `npm run dev`: Entwicklungsserver, auch im WLAN erreichbar
- `npm test`: Tests für Warteschlange, FSRS und Darstellung
- `npm run build`: Typprüfung und Build nach `dist/`

Ohne `.env.local` läuft nur der Demo-Modus.

## Supabase

- Registrierung in Supabase Auth ausschalten, deinen Nutzer im Dashboard
  anlegen.
- Unter Authentication, URL Configuration die Adresse der App als Site URL
  eintragen.
- Die App liest `card_states` mit den zugehörigen `items` (nur Status
  `freigegeben`), aktualisiert `card_states` und legt Zeilen in `reviews` an.
  Ein Lernobjekt ohne Zeile in `card_states` erscheint nicht. Der Importer legt
  diese Zeile beim Hochladen an.

## Lesemodus (Zusammenfassungen und Folienbilder)

Einmalig die Migrationen `supabase/migrations/20261107120000_notizen.sql` und
`supabase/migrations/20261108120000_module.sql` im Supabase SQL Editor
ausführen. Sie legen die Tabellen `notes` und `modules` und den privaten
Bucket `folien` an.

Danach im Ordner `Lernassistent`:

```bash
.venv/bin/python -m importer.import_lesemodus
.venv/bin/python -m importer.import_lesemodus --schreiben
```

Der erste Aufruf ist ein Trockenlauf. Der zweite lädt die Notizen, die
Modulübersichten und die verkleinerten Bilder hoch. Danach nur noch nach Änderungen im Vault erneut
aufrufen, Unverändertes wird übersprungen.

In der App öffnet ein Tipp auf ein Modul die Wochenliste mit "Infos zum Modul"
(Eckdaten, Ablauf, Lernmethoden), ein Tipp auf eine
Woche die Notiz mit Bildern, Diagrammen und eingeklappten Lösungen. Unten gibt
es "Karten dieser Woche lernen".

## Cloudflare Pages

- Root directory: `app`
- Build command: `npm run build`
- Build output directory: `dist`
- Umgebungsvariablen: `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY`

## Auf dem iPhone installieren

Seite in Safari öffnen, Teilen, "Zum Home-Bildschirm".

## Hinweise

- Das Limit für neue Karten pro Tag und der Tageszähler liegen im Speicher des
  Geräts. Bei mehreren Geräten zählt jedes für sich.
- Bewertungen, die offline entstehen, werden gemerkt und beim nächsten Laden
  gesendet.
- Am Rechner: Leertaste deckt auf, 1 bis 4 bewerten.
