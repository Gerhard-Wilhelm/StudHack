-- StudHack: Wochennotizen und Folienbilder für den Lesemodus der App
-- Ziel: supabase/migrations/20261107120000_notizen.sql
--
--   notes          eine Zeile pro Wochennotiz (Markdown ohne Karteikarten-Abschnitt)
--   Bucket folien  verkleinerte Folienbilder, privat, Pfad <user_id>/<Kürzel>/<Bild>.jpg
--
-- Beides schreibt importer/import_lesemodus.py, angemeldet als Gerhard.

-- 1. Wochennotizen -----------------------------------------------------------------

create table public.notes (
  id            bigint generated always as identity primary key,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  module        text not null,                      -- Modulkürzel, z. B. IuF
  week          smallint check (week between 1 and 20),
  title         text not null,                      -- Thema der Woche
  body          text not null,                      -- Markdown mit LaTeX, Bilder als folien/<Kürzel>/<Bild>.jpg
  source_file   text,                               -- Haupt-PDF der Woche aus dem Frontmatter
  origin_ref    text not null,                      -- Pfad der Notiz im Vault
  content_hash  text not null,                      -- erkennt unveränderte Notizen beim erneuten Import
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint notes_unique_origin unique (user_id, origin_ref)
);

create index notes_user_module_week_idx on public.notes (user_id, module, week);

create trigger notes_set_updated_at
  before update on public.notes
  for each row execute function public.set_updated_at();

alter table public.notes enable row level security;

create policy notes_own on public.notes
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.notes to authenticated;

-- 2. Folienbilder ------------------------------------------------------------------
-- Privat: keine öffentlichen Links, die App holt zeitlich begrenzte Links.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('folien', 'folien', false, 2097152, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;

-- Jeder Nutzer nur in seinem eigenen Ordner (erste Pfadebene = user_id)
create policy folien_own_select on storage.objects
  for select to authenticated
  using (bucket_id = 'folien' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy folien_own_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'folien' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy folien_own_update on storage.objects
  for update to authenticated
  using (bucket_id = 'folien' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'folien' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy folien_own_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'folien' and (storage.foldername(name))[1] = (select auth.uid())::text);
