-- Résumé de l'appel précédent, relu au téléphone : une nouvelle source dans le
-- registre de consentement. Aucun changement de structure — consents.source est
-- du texte libre, sans contrainte — donc cette migration ne fait que RÉÉCRIRE ce
-- que la colonne a le droit de contenir, à l'endroit où on le cherchera.
--
-- Additif et idempotent : ne touche à aucune ligne, ne crée aucune table.
--
-- Numérotée 0015 et non 0013 : 0014 est déjà appliquée. `supabase db push`
-- considère une migration antérieure qui arrive APRÈS une migration déjà
-- appliquée comme hors séquence et la saute, sans erreur, tant qu'on ne passe
-- pas --include-all. En 0013 ce fichier ne serait jamais parti.

-- 'call_recap' = la personne autorise l'agent à lui relire, au téléphone, le
-- résumé de son dernier appel ENTRANT (call_logs.summary), et seulement quand
-- elle le demande.
--
-- Le défaut est ÉTEINT, et il l'est par construction : le registre est
-- append-only, l'état courant se lit dans la vue current_consents, et l'absence
-- de ligne y vaut refus (web/src/lib/skills/recap.ts fait de même sur une
-- lecture en erreur). Il n'y a donc rien à insérer ici — insérer quoi que ce
-- soit pour les comptes existants reviendrait à consentir à leur place.
--
-- Ce que ce consentement ne couvre PAS, et ne pourra jamais couvrir : les appels
-- SORTANTS. Quand l'agent appelle un commerce pour quelqu'un, la personne au
-- bout du fil n'a rien accepté. Ces appels sont écartés en dur côté application,
-- à deux endroits (la ligne lue : direction = 'inbound' ; l'appel en cours :
-- session.direction), pas par un réglage : aucune valeur de cette colonne ne
-- peut les faire ressortir.
comment on column public.consents.source is
  'Domaine du consentement : calendar | contacts | sms | outbound_calls | memory | recording | call_recap. '
  'Texte libre par choix (une contrainte CHECK ferait échouer un déploiement applicatif en avance sur la base) : '
  'la liste affichée fait foi côté application, web/src/app/tableau-de-bord/copy.ts.';
