// Configuration typée et validée (#51).
//
// L'app lisait `process.env` à la main via env.ts : une variable absente ou
// malformée n'apparaissait qu'à l'exécution, souvent au fond d'un appel, et
// aucun endroit ne savait quelles valeurs sont des secrets à ne jamais logguer.
// Ce module est la source unique :
//   - un schéma Zod valide le FORMAT de tout ce qui est présent ;
//   - un registre `SENSITIVE` marque les secrets, redactés partout où la config
//     est imprimée, logguée ou sérialisée vers le modèle ;
//   - un garde de démarrage (assertBootConfig) refuse de démarrer si une
//     variable requise manque ou tient encore sa valeur d'exemple.
//
// Ordre de précédence (géré par Next.js au chargement des fichiers .env) :
//   process.env  >  .env.$(NODE_ENV).local  >  .env.local  >  .env.$(NODE_ENV)  >  .env
// `.env.local` n'est pas chargé pendant les tests. En prod (Vercel) seules les
// variables d'environnement du projet comptent : il n'y a pas de fichier .env.

import { z } from "zod";

// Chaîne devant être une URL absolue valide (robuste entre versions de Zod).
const urlString = z.string().refine(
  (s) => {
    try {
      new URL(s);
      return true;
    } catch {
      return false;
    }
  },
  { message: "URL invalide" },
);

// Entier strictement positif, accepté sous forme de chaîne (les .env sont du texte).
const posInt = z.coerce.number().int().positive();

// Toutes les variables sont optionnelles au PARSING (le build et le client n'en
// ont pas toutes) ; assertBootConfig impose ensuite le noyau requis au démarrage.
const schema = z.object({
  NODE_ENV: z.string().optional(),

  // App / marque
  APP_URL: urlString.optional(),
  VERCEL_URL: z.string().optional(), // hôte nu injecté par Vercel, pas une URL complète
  NEXT_PUBLIC_BRAND_NAME: z.string().optional(),
  AGENT_NAME: z.string().optional(),

  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: urlString.optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  // Chiffrement applicatif
  ENCRYPTION_KEY: z.string().optional(),

  // Runtime vocal
  RUNTIME: z.enum(["selfhost", "vapi"]).optional(),
  RUNTIME_URL: urlString.optional(),
  RUNTIME_API_SECRET: z.string().optional(),

  // Vapi
  VAPI_API_KEY: z.string().optional(),
  VAPI_WEBHOOK_SECRET: z.string().optional(),
  VAPI_WEBHOOK_CREDENTIAL_ID: z.string().optional(),
  VAPI_ASSISTANT_ID: z.string().optional(),
  VAPI_PHONE_NUMBER_ID: z.string().optional(),

  // Modèles / voix
  AGENT_MODEL_PROVIDER: z.string().optional(),
  AGENT_MODEL: z.string().optional(),
  OUTBOUND_MODEL: z.string().optional(),
  ELEVENLABS_VOICE_ID: z.string().optional(),

  // Twilio
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),
  TWILIO_VERIFY_SERVICE_SID: z.string().optional(),

  // Google OAuth
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // Itinéraires
  ORS_API_KEY: z.string().optional(),

  // Crons / admin
  CRON_SECRET: z.string().optional(),

  // Langue par défaut
  DEFAULT_LANGUAGE: z.enum(["fr", "en", "es"]).optional(),

  // Plafonds de débit sur le numéro entrant
  INBOUND_MAX_CALLS_PER_CALLER_HOUR: posInt.optional(),
  INBOUND_MAX_CALLS_PER_CALLER_DAY: posInt.optional(),
  INBOUND_MAX_CALLS_PER_DAY: posInt.optional(),
});

export type Config = z.infer<typeof schema>;

// Secrets : toute valeur listée ici est masquée dès qu'on imprime/loggue/sérialise
// la config. La clé anon Supabase et le client_id Google sont publics par nature
// et n'y figurent pas.
export const SENSITIVE_KEYS: ReadonlySet<string> = new Set([
  "SUPABASE_SERVICE_ROLE_KEY",
  "ENCRYPTION_KEY",
  "RUNTIME_API_SECRET",
  "VAPI_API_KEY",
  "VAPI_WEBHOOK_SECRET",
  "TWILIO_AUTH_TOKEN",
  "GOOGLE_CLIENT_SECRET",
  "ORS_API_KEY",
  "CRON_SECRET",
]);

export function isSensitive(key: string): boolean {
  return SENSITIVE_KEYS.has(key);
}

// Noyau sans lequel le serveur ne peut pas démarrer utilement.
export const REQUIRED_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ENCRYPTION_KEY",
] as const;

// Valeurs d'exemple exactes tirées de web/.env.example.
const PLACEHOLDERS: Record<string, string[]> = {
  NEXT_PUBLIC_SUPABASE_URL: ["https://xxxx.supabase.co"],
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ["eyJ..."],
  SUPABASE_SERVICE_ROLE_KEY: ["eyJ..."],
};

// Une valeur est-elle restée un placeholder ? (valeur d'exemple exacte ou indice générique)
export function isPlaceholder(key: string, value: string | undefined): boolean {
  if (value === undefined || value === "") return false;
  if ((PLACEHOLDERS[key] ?? []).includes(value)) return true;
  if (/xxxx/i.test(value)) return true;
  if (value === "eyJ...") return true;
  if (/^(changeme|your[-_])/i.test(value)) return true;
  return false;
}

// Traite "" comme absent : les nombreuses lignes `CLE=` de .env.example ne
// doivent pas devenir des erreurs de validation.
function normalize(source: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(source)) {
    if (v !== undefined && v !== "") out[k] = v;
  }
  return out;
}

// Parse et valide le format. Échoue vite en nommant la/les variable(s) fautive(s).
export function parseConfig(source: Record<string, string | undefined> = process.env): Config {
  const result = schema.safeParse(normalize(source));
  if (!result.success) {
    const details = result.error.issues
      .map((i) => `${i.path.join(".") || "(racine)"} : ${i.message}`)
      .join(", ");
    throw new Error(`Configuration invalide — ${details}`);
  }
  return result.data;
}

// Valeur brute d'une variable, "" et absente confondues (utilisé par env.ts pour
// que tout accès aux variables passe par ce module).
export function readEnvValue(
  name: string,
  source: Record<string, string | undefined> = process.env,
): string | undefined {
  const v = source[name];
  return v === undefined || v === "" ? undefined : v;
}

// Valeur affichable d'une variable : masquée si secrète.
export function redactKey(key: string, value: string | undefined): string {
  if (value === undefined || value === "") return "";
  return isSensitive(key) ? "***" : value;
}

// Vue redactée de toute la config, sûre à logguer ou à sérialiser vers le modèle.
export function redactConfig(source: Record<string, string | undefined> = process.env): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(normalize(source))) out[k] = redactKey(k, v);
  return out;
}

// Garde de démarrage : format valide + noyau requis présent et non-placeholder.
// À appeler au boot du serveur (voir src/instrumentation.ts). Lève une erreur
// lisible qui empêche le serveur de démarrer sur une configuration cassée.
export function assertBootConfig(source: Record<string, string | undefined> = process.env): Config {
  const cfg = parseConfig(source); // les erreurs de format lèvent ici
  const clean = normalize(source);
  const problems: string[] = [];
  for (const key of REQUIRED_KEYS) {
    const v = clean[key];
    if (v === undefined) problems.push(`${key} (manquant)`);
    else if (isPlaceholder(key, v)) problems.push(`${key} (valeur d'exemple non remplacée)`);
  }
  if (problems.length > 0) {
    throw new Error(`Configuration de démarrage invalide — ${problems.join(", ")}. Voir web/.env.example.`);
  }
  return cfg;
}
