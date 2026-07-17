// Limite de débit sur le numéro entrant.
//
// Le numéro est public : n'importe qui peut le composer, et une minute de voix
// coûte ~0,14 $. `maxDurationSeconds` (cf. agents/inbound.ts) borne UN appel à
// ~0,42 $ ; il n'empêche pas de rappeler en boucle. Ceci borne le NOMBRE
// d'appels, et c'est ce qui manquait pour pouvoir publier le numéro.
//
// Deux garde-fous distincts :
//  - par appelant : quelqu'un qui rappelle en boucle s'arrête tout seul.
//  - global : borne la facture du jour même si l'abus vient de 50 numéros.
//
// Les appelants sans numéro présenté partagent un seul compteur : on ne peut
// pas les distinguer, donc on les traite comme un seul appelant.
//
// Vapi attend une réponse à assistant-request en ~7,5 s : ces requêtes ne font
// que compter des lignes, sur un index prévu pour (migration 0006).

import { envOr } from "./env";
import { supabaseAdmin } from "./supabase/admin";

const num = (name: string, fallback: string) => {
  const parsed = Number(envOr(name, fallback));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Number(fallback);
};

export type RateVerdict = { allowed: true } | { allowed: false; scope: "caller" | "global" };

// `fromNumber` omis -> compteur global. `null` -> le seau des appelants en
// numéro masqué, que le webhook journalise avec from_number = NULL : il faut
// donc interroger IS NULL, pas une valeur sentinelle. Une sentinelle
// ("__anonymous__") ne correspondait à aucune ligne, le compteur des masqués
// lisait toujours 0, et masquer son numéro suffisait à contourner la limite
// par appelant. Vérifié en base : 8 lignes à NULL, 0 à '__anonymous__'.
async function countInboundSince(sinceMs: number, fromNumber?: string | null): Promise<number> {
  const since = new Date(Date.now() - sinceMs).toISOString();
  let q = supabaseAdmin()
    .from("call_logs")
    .select("id", { count: "exact", head: true })
    .eq("direction", "inbound")
    .gte("started_at", since);
  if (fromNumber !== undefined) {
    q = fromNumber === null ? q.is("from_number", null) : q.eq("from_number", fromNumber);
  }
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

// Volontairement fail-closed : si la base ne répond pas, on ne peut pas savoir
// combien d'appels ont déjà eu lieu, donc on ne peut pas garantir le plafond.
// Ça ne dégrade rien en pratique — l'assistant a de toute façon besoin de la
// base pour personnaliser l'appel, et l'appel échouerait quelques lignes plus
// bas. Mieux vaut un appel refusé qu'une facture non bornée.
export async function inboundRateVerdict(callerNumber: string | null): Promise<RateVerdict> {
  const [callerHour, callerDay, globalDay] = await Promise.all([
    countInboundSince(60 * 60 * 1000, callerNumber),
    countInboundSince(24 * 60 * 60 * 1000, callerNumber),
    countInboundSince(24 * 60 * 60 * 1000),
  ]);

  if (callerHour >= num("INBOUND_MAX_CALLS_PER_CALLER_HOUR", "5")) return { allowed: false, scope: "caller" };
  if (callerDay >= num("INBOUND_MAX_CALLS_PER_CALLER_DAY", "20")) return { allowed: false, scope: "caller" };
  if (globalDay >= num("INBOUND_MAX_CALLS_PER_DAY", "60")) return { allowed: false, scope: "global" };
  return { allowed: true };
}

// Vapi prononce ce texte à l'appelant, puis raccroche.
export function rateLimitMessage(scope: "caller" | "global", language: string): string {
  if (language === "en") {
    return scope === "caller"
      ? "You've reached the call limit for now. Please try again later."
      : "The service has reached its limit for today. Please try again tomorrow.";
  }
  if (language === "es") {
    return scope === "caller"
      ? "Has alcanzado el límite de llamadas por ahora. Inténtalo un poco más tarde."
      : "El servicio ha alcanzado su límite por hoy. Inténtalo mañana.";
  }
  return scope === "caller"
    ? "Tu as atteint la limite d'appels pour le moment. Réessaie un peu plus tard."
    : "Le service a atteint sa limite pour aujourd'hui. Réessaie demain.";
}
