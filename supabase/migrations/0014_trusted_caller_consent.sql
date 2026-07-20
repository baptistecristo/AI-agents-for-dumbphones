-- Consentement « appelant de confiance » : une autorisation durable et
-- révocable, posée depuis le tableau de bord pour UN numéro précis, qui dispense
-- ce numéro du code jetable sur les seules LECTURES déjà protégées. Tout ce qui
-- envoie, dépense ou éteint continue d'exiger le code à chaque appel, quel que
-- soit le grant (web/src/lib/skills/gate.ts).
--
-- Additif et idempotent : ne touche à aucune ligne existante, ne supprime rien.

-- ---------------------------------------------------------------------------
-- 1. Pourquoi une colonne, alors qu'ajouter une source n'en demande aucune
-- ---------------------------------------------------------------------------
-- consents.source est du texte libre (0001) : d'habitude, une source de plus se
-- documente, elle ne se migre pas. Ça ne suffit pas ici, et pas par confort.
--
-- Le registre ne sait dire qu'une chose : « ce compte a autorisé ce domaine ».
-- Un grant « appelant de confiance » ne porte pas sur le compte, il porte sur un
-- numéro, et un compte peut en avoir plusieurs. Sans colonne, deux grants pour
-- deux numéros seraient deux lignes indistinguables (même user_id, même source),
-- et la vue current_consents, qui ne garde que la dernière ligne par
-- (user_id, source), en écraserait une avec l'autre : autoriser le deuxième
-- numéro autoriserait le premier, révoquer l'un révoquerait les deux, sans que
-- rien ne le signale.
--
-- D'où subject : QUI est visé. null pour les consentements de compte, donc pour
-- toutes les lignes déjà écrites, sans reprise de données. On reste dans le même
-- registre append-only : révoquer, c'est ajouter une ligne granted=false, jamais
-- modifier ou effacer.
alter table public.consents add column if not exists subject text;

comment on column public.consents.subject is
  'Identité visée par ce consentement. null = le compte entier, cas de toutes les sources globales. '
  'Non null = un numéro E.164 vérifié du compte, pour la source trusted_caller.';

create index if not exists consents_subject_idx
  on public.consents (user_id, source, subject, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. current_consents ne doit pas changer de sens
-- ---------------------------------------------------------------------------
-- La vue existante rend « la dernière ligne par (user_id, source) ». Les lignes
-- par numéro y entreraient en concurrence avec les consentements de compte, et
-- la page /autorisations lirait un état qui n'est pas le sien. On la borne donc
-- aux lignes sans sujet : mêmes colonnes, mêmes résultats qu'avant pour tout ce
-- qui existe déjà.
create or replace view public.current_consents as
select distinct on (user_id, source)
  user_id, source, granted, created_at
from public.consents
where subject is null
order by user_id, source, created_at desc;

-- 0004 : une vue s'exécute par défaut avec les droits de son créateur, donc sans
-- la RLS de l'appelant, ce qui avait déjà fait fuiter les consentements des
-- autres comptes. On le réaffirme après le remplacement plutôt que de parier sur
-- la conservation de l'option.
alter view public.current_consents set (security_invoker = true);

-- ---------------------------------------------------------------------------
-- 3. L'état courant par numéro
-- ---------------------------------------------------------------------------
-- Même forme que ci-dessus, une clé de plus. C'est ici que la révocation prend
-- effet : la vue ne rend que la ligne la plus récente pour un
-- (compte, source, numéro), donc un granted=false ajouté à 14 h fait foi dès la
-- lecture suivante. Il n'y a rien à invalider et rien à purger, parce qu'il n'y
-- a aucun cache : le chemin d'appel relit cette vue à chaque lot d'outils
-- (web/src/lib/consent.ts).
--
-- L'absence de ligne vaut refus. Personne n'est de confiance par défaut, et
-- aucune ligne n'est insérée ici pour les comptes existants : consentir à leur
-- place serait exactement ce que ce registre existe pour empêcher.
create or replace view public.current_caller_consents as
select distinct on (user_id, source, subject)
  user_id, source, subject, granted, created_at
from public.consents
where subject is not null
order by user_id, source, subject, created_at desc;

alter view public.current_caller_consents set (security_invoker = true);
