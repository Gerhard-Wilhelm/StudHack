-- StudHack: Zeitplan für die Edge Function erinnerungen (alle 5 Minuten)
--
-- Einmalig im Supabase SQL Editor ausführen, nachdem die Migration
-- 20261112120000_mitteilungen.sql gelaufen ist und die Funktion hochgeladen ist.
-- Vorher die beiden Platzhalter ersetzen:
--   <PROJEKT>       Projekt-Kennung aus der Supabase-URL (https://<PROJEKT>.supabase.co)
--   <CRON_SECRET>   dasselbe Passwort wie im Secret CRON_SECRET der Edge Function
-- Beide Werte landen im Supabase Vault, nicht in dieser Datei. Die ausgefüllte
-- Fassung nicht speichern und nicht committen.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select vault.create_secret('https://<PROJEKT>.supabase.co/functions/v1/erinnerungen', 'erinnerungen_url');
select vault.create_secret('<CRON_SECRET>', 'erinnerungen_secret');

select cron.schedule(
  'studhack-erinnerungen',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'erinnerungen_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'erinnerungen_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);

-- Prüfen:   select * from cron.job_run_details order by start_time desc limit 5;
-- Abschalten: select cron.unschedule('studhack-erinnerungen');
