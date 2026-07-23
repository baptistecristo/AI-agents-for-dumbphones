-- 0016 — Droits explicites pour les rôles du Data API + resserrage de deux
-- policies dont la moitié écriture n'était que surface d'attaque.
--
-- 1. GRANTs. Le projet hébergé historique expose public.* aux rôles PostgREST
--    par les privilèges d'époque. Depuis le passage de Supabase au défaut
--    « always-revoked » (cf. api.auto_expose_new_tables dans config.toml), un
--    projet neuf ou un `supabase db reset` local ne reçoit AUCUN privilège :
--    chaque requête du Data API — y compris en service_role — répond
--    « permission denied ». La prod ne le voit pas (droits hérités), un
--    contributeur ou un self-hosteur le voit immédiatement.
--
--    Principe : service_role voit tout (c'est le client serveur, il outrepasse
--    déjà la RLS) ; authenticated reçoit exactement ce que ses policies
--    permettent ; anon n'a que l'usage du schéma, aucune table.

grant usage on schema public to anon, authenticated, service_role;

grant all on all tables in schema public to service_role;
-- Les tables des prochaines migrations aussi : les migrations tournent en
-- postgres, ces défauts s'appliquent donc à ce qu'elles créeront. Volontairement
-- limité à service_role — exposer une table à authenticated doit rester un
-- geste explicite de la migration qui la crée.
alter default privileges in schema public grant all on tables to service_role;

-- Lecture seule là où la policy est SELECT, CRUD là où elle est FOR ALL.
grant select, insert, update, delete on public.profiles to authenticated;
grant select on public.phones to authenticated;
grant select on public.google_connections to authenticated;
grant select, insert on public.consents to authenticated;
grant select, insert, update, delete on public.reminders to authenticated;
grant select, insert, update, delete on public.memories to authenticated;
grant select on public.call_logs to authenticated;
grant select on public.sms_logs to authenticated;
grant select, insert, update, delete on public.outbound_jobs to authenticated;
grant select, insert, update, delete on public.important_senders to authenticated;
grant select on public.current_consents to authenticated;
grant select on public.current_caller_consents to authenticated;
-- text_sessions et capability_gaps : service_role uniquement, comme leurs
-- migrations l'annoncent. Pas de policy utilisateur, pas de grant.

-- 2. phones : la policy était FOR ALL alors qu'aucune écriture applicative ne
--    passe par le JWT utilisateur (l'onboarding écrit en service_role, après
--    l'OTP Twilio Verify). Or verified_at fait foi partout — le webhook Vapi
--    rattache l'appelant au compte par lui, les rappels SMS partent vers ces
--    numéros, trusted_caller l'exige. Un compte pouvait donc s'insérer
--    n'importe quel numéro avec verified_at forgé et court-circuiter l'OTP.
--    On ne garde que la lecture.
drop policy "own phones" on public.phones;
create policy "own phones" on public.phones
  for select to authenticated using ((select auth.uid()) = user_id);

-- 3. consents : même logique sur subject (0014). Le chemin serveur
--    (recordCallerTrust) vérifie que subject est un numéro vérifié du compte ;
--    l'insert direct via le Data API ne vérifiait rien, ce qui permettait de
--    forger un consentement trusted_caller pour un numéro arbitraire. Par le
--    JWT utilisateur on ne consigne que des consentements de compte
--    (subject null) ; les lignes par numéro restent au service_role.
drop policy "consents insert own" on public.consents;
create policy "consents insert own" on public.consents
  for insert to authenticated
  with check ((select auth.uid()) = user_id and subject is null);

-- 4. Le commentaire « la liste affichée fait foi » posé en 0015 sur
--    consents.source omettait deux sources déjà en base (action_items depuis
--    0012, trusted_caller depuis 0014). Liste complète, même règle.
comment on column public.consents.source is
  'Domaine du consentement : calendar | contacts | sms | outbound_calls | memory | recording | call_recap | action_items | trusted_caller (ce dernier avec subject non null). '
  'Texte libre par choix (une contrainte CHECK ferait échouer un déploiement applicatif en avance sur la base) : '
  'la liste affichée fait foi côté application, web/src/app/tableau-de-bord/copy.ts et web/src/lib/consent.ts.';
