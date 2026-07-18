// Accès centralisé aux variables d'environnement.
// Tout est optionnel au build ; les routes qui en dépendent vérifient à l'exécution.
// La lecture passe par config.ts (source unique, schéma typé + garde de démarrage) :
// ces accesseurs restent pour la compatibilité et gardent leur sémantique « lève
// si absent ». Le schéma et les secrets vivent dans ./config.

import { readEnvValue } from "./config";

export function env(name: string): string {
  const v = readEnvValue(name);
  if (v === undefined) throw new Error(`Variable d'environnement manquante : ${name}`);
  return v;
}

export function envOr(name: string, fallback: string): string {
  return readEnvValue(name) ?? fallback;
}

// URL publique de CETTE instance. Trois cas, dans cet ordre :
//  1. APP_URL si définie — en production c'est l'alias stable qu'on veut, pas
//     l'URL du déploiement du jour.
//  2. VERCEL_URL sinon : Vercel l'injecte à chaque déploiement. C'est ce qui
//     fait marcher les preview, dont l'URL change à chaque commit et ne peut
//     donc pas être écrite dans une variable figée.
//  3. localhost en dev.
// Le slash final est retiré : tous les appelants concatènent « /api/… ».
export const APP_URL = () => {
  const explicit = process.env.APP_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
};
