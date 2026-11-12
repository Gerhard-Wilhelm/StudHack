-- StudHack: selbst gewählte Farben je Modul
-- Ziel: supabase/migrations/20261115120000_modulfarben.sql
--
-- module_colors  eine Zeile je Modul mit der Farbe, die in den Einstellungen gewählt wurde.
--                Fehlt ein Modul, nimmt die App die automatische Farbe aus dem Lernplan.
-- Die App legt Zeilen an, ändert und löscht sie ("Standard"). Ohne diese Tabelle nutzt
-- die App einfach die Standardfarben.

create table public.module_colors (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  module      text not null,                           -- Modulkürzel, z. B. BIL
  color       text not null check (color ~ '^#[0-9a-f]{6}$'),
  updated_at  timestamptz not null default now(),
  primary key (user_id, module)
);

create trigger module_colors_set_updated_at
  before update on public.module_colors
  for each row execute function public.set_updated_at();

alter table public.module_colors enable row level security;

create policy module_colors_own on public.module_colors
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.module_colors to authenticated;
