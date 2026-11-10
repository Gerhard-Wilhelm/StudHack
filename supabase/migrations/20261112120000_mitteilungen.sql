-- StudHack: Mitteilungen per Web-Push
-- Ziel: supabase/migrations/20261112120000_mitteilungen.sql
--
-- push_subscriptions  ein Gerät, das Mitteilungen bekommt, mit Schaltern je Mitteilungsart
-- push_sent           bereits verschickte Mitteilungen, damit keine doppelt kommt
--
-- Die App legt push_subscriptions an und ändert die Schalter. Die Edge Function erinnerungen
-- liest beides mit dem Service-Schlüssel und schreibt push_sent. Den Zeitplan dazu legt
-- supabase/zeitplan_erinnerungen.sql an (erst nach den Secrets ausführen).

create table public.push_subscriptions (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint    text not null unique,                 -- Adresse des Push-Dienstes für dieses Gerät
  p256dh      text not null,
  auth        text not null,
  prefs       jsonb not null default '{"block": true, "abend": true, "wochenplan": true, "entwuerfe": true, "morgen": true}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

create trigger push_subscriptions_set_updated_at
  before update on public.push_subscriptions
  for each row execute function public.set_updated_at();

alter table public.push_subscriptions enable row level security;

create policy push_subscriptions_own on public.push_subscriptions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.push_subscriptions to authenticated;


create table public.push_sent (
  user_id  uuid not null references auth.users (id) on delete cascade,
  kind     text not null,                          -- block, abend, wochenplan, entwuerfe, morgen
  ref      text not null,                           -- Block-ID, Tag oder neueste Entwurf-ID
  sent_at  timestamptz not null default now(),
  primary key (user_id, kind, ref)
);

alter table public.push_sent enable row level security;

create policy push_sent_own on public.push_sent
  for select to authenticated
  using ((select auth.uid()) = user_id);

grant select on public.push_sent to authenticated;
