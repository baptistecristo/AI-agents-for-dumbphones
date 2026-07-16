-- Manques de capacité remontés en appel (web/src/lib/skills/gap.ts).
--
-- Quand l'appelant demande quelque chose qu'aucun outil ne couvre, l'agent
-- appelle report_unsupported_request : une ligne atterrit ici. Le cron quotidien
-- /api/cron/reports en fait UN e-mail digest (Resend) avec, pour chaque manque,
-- un prompt prêt à coller dans Claude Code. Si l'appelant a demandé un SMS
-- (notify_caller) et que le mainteneur a livré la capacité (resolved_at), le même
-- cron le prévient par SMS — dormant tant qu'aucun fournisseur SMS n'est branché.

create table public.capability_gaps (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  call_id text,
  user_id uuid references public.profiles(id) on delete set null,
  caller_number text,
  language text,
  request_summary text not null,
  caller_words text,
  notify_caller boolean not null default false,
  status text not null default 'pending',   -- 'pending' | 'sent' | 'error' (digest e-mail)
  notified_at timestamptz,                   -- e-mail digest parti
  error text,
  resolved_at timestamptz,                   -- le mainteneur bascule ça à la livraison
  caller_notified_at timestamptz             -- SMS « c'est prêt » parti
);

-- Service-role uniquement, comme call_logs / sms_logs : RLS activé, aucune policy.
-- Le skill et le cron passent par supabaseAdmin() (service role, qui outrepasse
-- RLS). Aucune lecture côté utilisateur.
alter table public.capability_gaps enable row level security;

create index capability_gaps_pending_idx on public.capability_gaps (status, created_at);
create index capability_gaps_resolved_idx on public.capability_gaps (resolved_at) where notify_caller;

-- Cron quotidien : un seul e-mail à 03:00 UTC (~05:00 Europe/Paris l'été ; pg_cron
-- tourne dans le fuseau de la base, UTC sur Supabase, et l'heure d'été décale Paris
-- d'une heure — acceptable pour un digest quotidien qui doit juste arriver avant le
-- matin). Même schéma que 0005_scheduler.sql (app_url + cron_secret en Vault).
select cron.schedule(
  'capability-gaps-daily',
  '0 3 * * *',
  $$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url')
           || '/api/cron/reports',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    )
  );
  $$
);
