-- StudHack: Modulübersichten für die App
-- Ziel: supabase/migrations/20261108120000_module.sql
--
--   modules   eine Zeile pro Modul: Kürzel, voller Name und Übersicht aus dem Vault
--             (Eckdaten, Hinweise, Ablaufplan, Lernmethoden, ohne Wochentabelle)
--
-- Schreibt importer/import_lesemodus.py, angemeldet als Gerhard.

create table public.modules (
  id            bigint generated always as identity primary key,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  module        text not null,                      -- Modulkürzel, z. B. MAK
  name          text not null,                      -- voller Name, z. B. Makroökonomie
  body          text not null,                      -- Markdown mit LaTeX
  origin_ref    text not null,                      -- Pfad der Übersichtsnotiz im Vault
  content_hash  text not null,                      -- erkennt unveränderte Übersichten beim erneuten Import
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint modules_unique_module unique (user_id, module)
);

create trigger modules_set_updated_at
  before update on public.modules
  for each row execute function public.set_updated_at();

alter table public.modules enable row level security;

create policy modules_own on public.modules
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.modules to authenticated;
