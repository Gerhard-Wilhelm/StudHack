-- StudHack: Lernplan-Kalender mit 2-Stunden-Blöcken
-- Ziel: supabase/migrations/20261111120000_lernplan.sql
--
-- study_blocks  ein geplanter Lernblock: Modul, Tag, Startzeit, Dauer, erledigt
--
-- Die App legt Blöcke an, verschiebt und löscht sie. kalender.py liest sie (nur lesend)
-- und schreibt daraus die Vault-Notiz 02 Lernplan/Kalender.md.

create table public.study_blocks (
  id            bigint generated always as identity primary key,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  module        text not null,                       -- Modulkürzel, z. B. BIL
  day           date not null,
  start_time    time not null,                       -- 06:00 bis 22:00 im 30-Minuten-Raster
  duration_min  smallint not null default 120 check (duration_min between 30 and 480),
  done          boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index study_blocks_user_day_idx on public.study_blocks (user_id, day);

create trigger study_blocks_set_updated_at
  before update on public.study_blocks
  for each row execute function public.set_updated_at();

alter table public.study_blocks enable row level security;

create policy study_blocks_own on public.study_blocks
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.study_blocks to authenticated;
