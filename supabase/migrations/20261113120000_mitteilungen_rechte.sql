-- StudHack: Rechte für die Edge Function erinnerungen
-- Ziel: supabase/migrations/20261113120000_mitteilungen_rechte.sql
--
-- Die Funktion arbeitet mit dem Service-Schlüssel (Rolle service_role). Dieses Projekt
-- vergibt Rechte an neuen Tabellen nicht automatisch, deshalb hier ausdrücklich.
-- RLS gilt für service_role nicht, die App bekommt dadurch keine zusätzlichen Rechte.

grant select, insert, update, delete on public.push_subscriptions to service_role;
grant select, insert, update, delete on public.push_sent to service_role;
grant select on public.study_blocks, public.modules, public.card_states, public.items to service_role;
