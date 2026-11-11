-- StudHack: Rechenaufgaben mit Zahleneingabe
-- Ziel: supabase/migrations/20261114120000_rechenaufgaben.sql
--
-- Neue Spalte eingaben, nur beim Typ rechenaufgabe: die Felder, in die du in der App
-- deine Ergebnisse tippst, mit Sollwert und erlaubter Abweichung.
--   [{"label": "a) Endkapital", "wert": 1102.5, "toleranz": 0.01, "einheit": "€"}]
-- Bei einheit "%" steht wert in Prozent (5.25 heißt 5,25 %).
-- Erzeugt werden sie von generator/generate_rechen.py als Entwurf (status 'entwurf').
-- Vor dem Merge ausführen, sonst lädt die App die Spalte nicht.

alter table public.items add column eingaben jsonb;

alter table public.items add constraint items_eingaben_only_rechenaufgabe
  check (eingaben is null or (type = 'rechenaufgabe' and jsonb_typeof(eingaben) = 'array'));
