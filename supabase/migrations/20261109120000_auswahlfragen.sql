-- StudHack: Auswahlfragen mit mehreren richtigen Antworten
-- Ziel: supabase/migrations/20261109120000_auswahlfragen.sql
--
-- Neuer Typ multiple_choice neben single_choice. Die Antworten stehen in options:
--   single_choice    {"choices": [...], "correct": 1}
--   multiple_choice  {"choices": [...], "correct": [0, 2]}
-- Erzeugt werden sie von generator/generate_mc.py als Entwurf (status 'entwurf').

alter table public.items drop constraint items_type_check;
alter table public.items add constraint items_type_check
  check (type in ('karteikarte', 'verstaendnisfrage', 'single_choice', 'multiple_choice', 'rechenaufgabe'));

alter table public.items drop constraint items_options_only_single_choice;
alter table public.items add constraint items_options_only_choice
  check (options is null or type in ('single_choice', 'multiple_choice'));

-- Für die Freigabe-Liste: Entwürfe schnell finden (status ist schon indiziert),
-- generator-Fragen je Notiz erkennen
create index items_user_origin_ref_idx on public.items (user_id, origin, origin_ref);
