-- Corrections de sécurité et de performance signalées par les advisors Supabase.
-- Additif : 0001 est déjà appliqué, on ne le réécrit pas.

-- ---------------------------------------------------------------------------
-- 1. Fuite de données : la vue current_consents contournait la RLS
-- ---------------------------------------------------------------------------
-- Une vue s'exécute par défaut avec les droits de son créateur (postgres), donc
-- sans la RLS de l'appelant : n'importe quel utilisateur connecté lisait les
-- consentements de *tous* les autres. Reproduit avant correction : Alice voyait
-- 1 ligne dans public.consents (RLS correcte) mais 2 dans public.current_consents.
-- security_invoker (PG15+) fait appliquer les droits — donc la RLS — de l'appelant.
alter view public.current_consents set (security_invoker = true);

-- ---------------------------------------------------------------------------
-- 2. Hygiène : EXECUTE sur une fonction de trigger exposée via /rest/v1/rpc/
-- ---------------------------------------------------------------------------
-- handle_new_user() n'est pas réellement exploitable — Postgres refuse déjà
-- l'appel direct ("trigger functions can only be called as triggers") — mais
-- anon et authenticated n'ont aucune raison d'avoir ce privilège.
-- Postgres accorde EXECUTE à PUBLIC par défaut : révoquer seulement sur anon et
-- authenticated ne suffirait pas, ils en héritent via PUBLIC.
-- Le trigger on_auth_user_created continue de fonctionner : le privilège EXECUTE
-- est vérifié à la création du trigger, pas à chaque déclenchement.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Performance : auth.uid() réévalué à chaque ligne dans les politiques RLS
-- ---------------------------------------------------------------------------
-- (select auth.uid()) est évalué une seule fois par requête au lieu d'une fois
-- par ligne (initplan). Sémantique identique, coût qui cesse de croître avec le
-- nombre de lignes. Voir lint 0003_auth_rls_initplan.
alter policy "own profile" on public.profiles
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
alter policy "own phones" on public.phones
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "own google" on public.google_connections
  using ((select auth.uid()) = user_id);
alter policy "own consents" on public.consents
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "own reminders" on public.reminders
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "own memories" on public.memories
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "own calls" on public.call_logs
  using ((select auth.uid()) = user_id);
alter policy "own sms" on public.sms_logs
  using ((select auth.uid()) = user_id);
alter policy "own jobs" on public.outbound_jobs
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "own senders" on public.important_senders
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
