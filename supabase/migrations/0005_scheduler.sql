-- Ordonnancement des tâches périodiques dans Postgres, pas chez l'hébergeur.
--
-- Pourquoi : les rappels et les missions sortantes doivent partir à la minute
-- (`placeCall` ne fait qu'empiler un job ; c'est /api/cron/outbound qui passe
-- réellement l'appel). Or le plan gratuit de Vercel plafonne ses crons à un
-- déclenchement par jour et refuse le déploiement au-delà. pg_cron + pg_net
-- rendent l'ordonnancement gratuit et indépendant de l'hébergeur : n'importe
-- quel déploiement public de l'app Next fonctionne, Vercel ou non.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- PRÉREQUIS — à exécuter UNE FOIS dans le SQL editor du projet Supabase.
-- Ces deux valeurs sont des secrets : elles vivent dans Vault, jamais dans git.
--
--   select vault.create_secret('https://votre-app.vercel.app', 'app_url');
--   select vault.create_secret('<votre CRON_SECRET>', 'cron_secret');
--
-- `cron_secret` doit être identique à la variable d'env CRON_SECRET de l'app,
-- sinon les routes répondent 401 et rien ne se déclenche.

select cron.schedule(
  'reminders-every-minute',
  '* * * * *',
  $$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url')
           || '/api/cron/reminders',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    )
  );
  $$
);

select cron.schedule(
  'outbound-every-minute',
  '* * * * *',
  $$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url')
           || '/api/cron/outbound',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    )
  );
  $$
);

-- Vérifier : select * from cron.job;
-- Historique : select * from cron.job_run_details order by start_time desc limit 20;
