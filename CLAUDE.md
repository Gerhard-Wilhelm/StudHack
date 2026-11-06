# StudHack Lernassistent

Lern-App für Gerhards Studium an der MLU Halle. Lädt Materialien aus Stud.IP,
erzeugt daraus Wochennotizen und Lernfragen und fragt sie mit Spaced Repetition
am iPhone ab.

## Regeln

- Vor jeder Datei-Änderung kurz zeigen, was geändert wird, und auf ein Go warten.
  In Cloud-Sessions: nur auf einem eigenen Branch arbeiten, übernommen wird erst
  nach Gerhards Go im Pull Request.
- Die Stud.IP JSON:API wird ausschließlich lesend genutzt (nur GET).
- `.env` enthält Gerhards Zugangsdaten. Claude liest, druckt oder ändert diese
  Datei nie.
- Keine Folieninhalte, PDFs, extrahierten Texte oder Vault-Notizen ins
  Repository. Testdaten nur selbst geschrieben und kurz.
- Keine Schlüssel im Code (Supabase, Claude API). Lokal in `.env`, bei Supabase
  als Secrets.
- Der Scanner läuft nur auf Gerhards Mac. Cloud-Sessions bauen und testen ohne
  Stud.IP-Zugang.
- Neue Lernobjekte aus dem Generator sind Entwürfe und kommen erst nach
  Gerhards Freigabe in den Lernstapel.
- Infrastruktur nur im Gratis-Tarif. Laufende Kosten entstehen nur durch die
  Claude API.
- Schreibstil: duzen, keine Emojis, keine Gedankenstriche.

## Architektur (Phase A)

- Mac: Scanner, Importer, Generator (Claude Sonnet mit Prüfdurchlauf),
  Obsidian-Vault unter `~/StudHack/Studium Vault/`. Das Notizformat steht
  in der CLAUDE.md des Vaults, nicht im Repository.
- Supabase (Gratis-Tarif, Region Frankfurt): Postgres, Edge Functions in
  TypeScript, Storage nur für Folienbilder zitierter Seiten.
- iPhone: PWA mit Karteikarten, Abfragen, Zahleneingabe, Freigabe-Liste,
  Lesemodus und Push.
- Wiederholungsplan: FSRS (ts-fsrs).
- Bewertung freier Antworten: Claude Haiku in einer Edge Function.

## Aufbau

Bestehend:
- `config.yaml`: Module, Kurs-IDs, Vault-Pfad
- `scanner/client.py`: API-Zugriff und Anmeldung
- `scanner/scan.py`: Abgleich, Download, Bericht (Einstiegspunkt)
- `scanner/extract.py`: Text aus PDFs nach `cache/text/`
- `state/state.json`: bereits geladene Dateien (lokal, nicht im Repository)
- `reports/`: Berichte über neue Materialien (lokal, nicht im Repository)
- `importer/import_notes.py`: Karteikarten und Verständnisfragen aus den Wochennotizen nach Supabase (Standard Trockenlauf, `--schreiben` lädt hoch)
- `supabase/migrations/`: Datenmodell (Tabellen items, card_states, reviews)

Geplant:
- `generator/`: neue Folien zu Notiz und Fragen
- `supabase/functions/`: Edge Functions
- `app/`: PWA

## Lernobjekte

Jedes Lernobjekt hat: Typ (Karteikarte, Verständnisfrage, Single Choice,
Rechenaufgabe), Frage, Lösung, Quelle (Datei und PDF-Seite), Modul, Woche,
Status (Entwurf, freigegeben, verworfen) und FSRS-Zustand. Als Quelle zählt die
PDF-Seite, nicht die auf der Folie gedruckte Nummer.
