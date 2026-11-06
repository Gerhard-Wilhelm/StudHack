-- StudHack: Datenmodell für Lernobjekte, Lernstand und Antworten
-- Ziel: supabase/migrations/20261106120000_lernobjekte.sql
--
-- Drei Tabellen:
--   items        Lernobjekte (Karteikarte, Verständnisfrage, Single Choice, Rechenaufgabe)
--   card_states  Lernstand pro Lernobjekt nach FSRS (ts-fsrs)
--   reviews      jede einzelne Abfrage mit Bewertung
--
-- Jede Zeile gehört einem Nutzer (user_id). Row Level Security sorgt dafür,
-- dass jeder angemeldete Nutzer nur seine eigenen Zeilen sieht.
-- Der Importer auf dem Mac nutzt den service_role-Schlüssel aus der lokalen .env.

-- Hilfsfunktion: updated_at automatisch setzen
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 1. Lernobjekte ---------------------------------------------------------------

create table public.items (
  id            bigint generated always as identity primary key,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  module        text not null,                      -- Modulkürzel, z. B. IuF, STA1
  week          smallint check (week between 1 and 20),
  type          text not null check (type in ('karteikarte', 'verstaendnisfrage', 'single_choice', 'rechenaufgabe')),
  question      text not null,
  answer        text not null,                      -- Musterlösung, Markdown mit LaTeX
  options       jsonb,                              -- nur Single Choice: {"choices": [...], "correct": 0}
  source_file   text,                               -- z. B. BA02_Finanzmathematik.pdf
  source_page   integer check (source_page > 0),    -- PDF-Seite, nicht die gedruckte Foliennummer
  origin        text not null default 'manuell' check (origin in ('import', 'generator', 'manuell')),
  origin_ref    text,                               -- z. B. Pfad der Wochennotiz
  content_hash  text not null,                      -- verhindert Doppelte beim erneuten Import
  status        text not null default 'entwurf' check (status in ('entwurf', 'freigegeben', 'verworfen')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint items_options_only_single_choice check (options is null or type = 'single_choice'),
  constraint items_unique_content unique (user_id, content_hash)
);

create index items_user_status_idx on public.items (user_id, status);
create index items_user_module_week_idx on public.items (user_id, module, week);

create trigger items_set_updated_at
  before update on public.items
  for each row execute function public.set_updated_at();

-- 2. Lernstand nach FSRS ---------------------------------------------------------
-- Felder entsprechen dem Card-Objekt von ts-fsrs.

create table public.card_states (
  item_id         bigint primary key references public.items (id) on delete cascade,
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  due             timestamptz not null default now(),
  stability       double precision not null default 0,
  difficulty      double precision not null default 0,
  elapsed_days    integer not null default 0,
  scheduled_days  integer not null default 0,
  learning_steps  integer not null default 0,
  reps            integer not null default 0,
  lapses          integer not null default 0,
  state           smallint not null default 0 check (state between 0 and 3),  -- 0 neu, 1 lernen, 2 wiederholen, 3 neu lernen
  last_review     timestamptz
);

-- Hauptabfrage der App: "Was ist heute fällig?"
create index card_states_user_due_idx on public.card_states (user_id, due);

-- 3. Antworten -------------------------------------------------------------------

create table public.reviews (
  id           bigint generated always as identity primary key,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id      bigint not null references public.items (id) on delete cascade,
  rating       smallint not null check (rating between 1 and 4),  -- FSRS: 1 nochmal, 2 schwer, 3 gut, 4 leicht
  answer_text  text,                                -- deine Antwort bei Freitext oder Rechnung
  feedback     text,                                -- Rückmeldung von Claude
  graded_by    text not null default 'selbst' check (graded_by in ('selbst', 'claude')),
  duration_ms  integer check (duration_ms >= 0),
  reviewed_at  timestamptz not null default now()
);

create index reviews_item_id_idx on public.reviews (item_id);
create index reviews_user_reviewed_at_idx on public.reviews (user_id, reviewed_at);

-- 4. Zugriffsregeln (Row Level Security) -----------------------------------------

alter table public.items       enable row level security;
alter table public.card_states enable row level security;
alter table public.reviews     enable row level security;

create policy items_own on public.items
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy card_states_own on public.card_states
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy reviews_own on public.reviews
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- 5. Freigaben für die Data API ---------------------------------------------------
-- "Automatically expose new tables" ist aus, deshalb ausdrücklich freigeben.
-- Nur angemeldete Nutzer, keine anonymen Zugriffe.

grant select, insert, update, delete on public.items       to authenticated;
grant select, insert, update, delete on public.card_states to authenticated;
grant select, insert                 on public.reviews     to authenticated;
