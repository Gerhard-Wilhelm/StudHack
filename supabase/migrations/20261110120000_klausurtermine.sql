-- StudHack: gewählter Klausurtermin je Modul
-- Ziel: supabase/migrations/20261110120000_klausurtermine.sql
--
-- Kommt aus config.yaml (module.<Kürzel>.pruefung) über importer/import_lesemodus.py.
-- Die App zeigt damit einen Countdown, verteilt neue Karten nach Dringlichkeit
-- und fragt Module nach ihrer Klausur nicht mehr ab.

alter table public.modules add column exam_date date;
