-- StudHack: frei gewählte Kürzel je Modul
-- Ziel: supabase/migrations/20261116120000_modulkuerzel.sql
--
-- module_colors bekommt die Spalte kuerzel. Die App zeigt es überall statt des Original-Kürzels an,
-- nur die Mitteilungen nutzen vorerst weiter das Original.
-- Intern bleibt das Original-Kürzel in der Spalte module der Schlüssel.
-- Eine Zeile braucht jetzt nur noch Farbe oder Kürzel, nicht mehr beides.

alter table public.module_colors
  alter column color drop not null;

alter table public.module_colors
  add column kuerzel text
    check (kuerzel is null or (char_length(kuerzel) between 1 and 12 and kuerzel = btrim(kuerzel)));

alter table public.module_colors
  add constraint module_colors_etwas_gesetzt check (color is not null or kuerzel is not null);
