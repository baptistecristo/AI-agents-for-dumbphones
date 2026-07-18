-- Canal texte : conversation en langage naturel par SMS (le même agent que la
-- voix), avec écritures protégées par un PIN court réglé dans le tableau de bord.
-- Additif et idempotent : ne touche à rien d'existant.

-- PIN texte (3 chiffres). Stocké en HMAC-SHA256 keyé par ENCRYPTION_KEY, jamais
-- en clair (voir web/src/lib/text-pin.ts). null = aucun PIN posé -> les
-- écritures par SMS restent refusées tant que la personne n'en a pas réglé un.
-- Les LECTURES par SMS ne l'exigent pas : la réponse ne part qu'au numéro
-- enregistré, jamais à un expéditeur usurpé (cf. skills/gate.ts).
alter table public.profiles add column if not exists text_pin_hash text;

-- Une "session texte" = l'état d'un fil SMS (un numéro expéditeur rattaché à un
-- compte). Elle sert à deux choses, toutes deux absentes du canal vocal (où
-- l'appel donne lui-même un début et une fin) :
--   1. déverrouiller les écritures après un PIN correct, avec expiration
--      (verified_until) — l'équivalent SMS du "débloqué pour cet appel" ;
--   2. borner les tentatives (failed_attempts / locked_until) : un PIN à
--      3 chiffres n'a que 1000 valeurs, donc l'anti-bruteforce n'est pas
--      optionnel. C'est ici, pas dans le code applicatif, qu'il survit aux
--      redémarrages.
create table if not exists public.text_sessions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  e164 text not null,
  verified_until timestamptz,
  failed_attempts int not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, e164)
);

-- Service-role uniquement, comme call_logs / sms_logs : RLS activé, aucune
-- policy. Rien n'y accède depuis le client ; tout passe par la clé service.
alter table public.text_sessions enable row level security;
