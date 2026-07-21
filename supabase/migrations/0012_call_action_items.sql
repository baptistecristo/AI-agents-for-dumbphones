-- Engagements extraits d'un appel terminé -> table reminders.
-- Additif et idempotent : ne touche à rien d'existant.

-- D'où vient un rappel. null = posé par la personne elle-même (skill
-- set_reminder, tous les rappels existants). Non null = extrait du transcript
-- d'un appel à la fin de celui-ci.
--
-- Cette colonne fait deux choses :
--   1. elle rend l'origine relisible — un rappel qu'on n'a pas dicté soi-même
--      doit pouvoir être rattaché à l'appel qui l'a produit ;
--   2. elle sert de garde d'idempotence. Le rapport de fin d'appel peut être
--      rejoué par la plateforme téléphonique ; sans elle, un rejeu insérerait
--      une deuxième fois les mêmes lignes, en silence.
--
-- on delete set null, pas cascade : le rappel appartient à la personne, pas au
-- journal d'appels. Purger un appel ne doit pas faire disparaître ce qu'elle
-- s'était engagée à faire.
alter table public.reminders
  add column if not exists source_call_id uuid references public.call_logs (id) on delete set null;

create index if not exists reminders_source_call_idx on public.reminders (source_call_id);

-- Consentement : rien à créer. consents.source est du texte libre (0001), donc
-- la nouvelle source « action_items » n'exige aucun DDL. Elle est notée ici
-- parce que c'est le seul endroit où le schéma en garde la trace.
--
-- Pourquoi une source à elle seule, et pas « recording » : les deux ne servent
-- pas la même finalité. « recording » couvre le fait de GARDER et transcrire un
-- appel ; « action_items » couvre le fait d'en TIRER des engagements et de les
-- écrire ailleurs. Autoriser la première n'autorise pas la seconde, et le
-- registre doit pouvoir les distinguer. Défaut : refusé.
comment on column public.reminders.source_call_id is
  'Appel dont ce rappel a été extrait (consentement action_items). null = posé par la personne.';
