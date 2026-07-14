-- Renommage du preset de mission « docteur » -> « appointment ».
--
-- Le preset n'a jamais été réservé aux médecins : il couvre toute prise de
-- rendez-vous (médecin, coiffeur, garage…). L'ancien nom décrivait un cas
-- d'usage d'origine, pas la capacité réelle.
--
-- `outbound_jobs.kind` et `call_logs.agent` sont des colonnes text libres (pas
-- d'enum ni de contrainte CHECK) : un backfill des lignes existantes suffit,
-- aucun changement de schéma n'est nécessaire.

update outbound_jobs set kind = 'appointment' where kind = 'docteur';
update call_logs set agent = 'appointment' where agent = 'docteur';
