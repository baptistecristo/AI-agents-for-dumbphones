-- Bilingue FR/EN (pivot open-source) : langue préférée par utilisateur,
-- langue retenue par appel (sert aux skills et au runtime vocal).

alter table public.profiles
  add column if not exists preferred_language text not null default 'fr'; -- 'fr' | 'en'

alter table public.call_logs
  add column if not exists language text;                                 -- 'fr' | 'en'
