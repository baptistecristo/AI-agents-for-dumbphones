// Accès centralisé aux variables d'environnement.
// Tout est optionnel au build ; les routes qui en dépendent vérifient à l'exécution.

export function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variable d'environnement manquante : ${name}`);
  return v;
}

export function envOr(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

export const APP_URL = () => envOr("APP_URL", "http://localhost:3000");
