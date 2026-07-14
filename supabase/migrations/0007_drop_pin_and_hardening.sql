-- 0007 — Auth par code jetable (Twilio Verify) en cours d'appel.
-- Le PIN stocké (profiles.pin_hash) n'a plus de raison d'être : le code est
-- envoyé par SMS au numéro enregistré à chaque appel, jamais mémorisé.
-- + deux durcissements de l'audit 2026-07-14 (consents append-only, pg_net).

-- 1. Plus de PIN stocké.
--    Prérequis de déploiement : appliquer CETTE migration à la base live seulement
--    APRÈS avoir déployé le code qui ne lit plus pin_hash (sinon l'app casse).
alter table public.profiles drop column if exists pin_hash;

-- 2. consents : piste d'audit RGPD -> append-only. On n'update/delete jamais.
--    L'ancienne policy "own consents" était FOR ALL : un utilisateur pouvait
--    réécrire/effacer sa propre trace de consentement. On la scinde en
--    insert + select, sans update ni delete.
drop policy if exists "own consents" on public.consents;
create policy "consents insert own" on public.consents
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "consents select own" on public.consents
  for select to authenticated using ((select auth.uid()) = user_id);

-- 3. pg_net : la primitive HTTP est une amorce SSRF côté base. Elle n'est pas
--    exposée via PostgREST aujourd'hui, mais on retire l'accès aux rôles Data API
--    par défense en profondeur (le scheduler tourne en postgres/superuser).
revoke usage on schema net from anon, authenticated;
revoke execute on all functions in schema net from anon, authenticated;
