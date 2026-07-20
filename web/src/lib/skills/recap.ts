// Skill « résumé de l'appel précédent » — la livraison SANS écran.
//
// call_logs.summary existe depuis 0001 et n'était lu que par le tableau de bord,
// c'est-à-dire par un écran, pour quelqu'un qu'on suppose sans écran. Ici on le
// rend à la voix : au début de l'appel suivant, et seulement si on le demande.
//
// Trois verrous, dans cet ordre, et aucun ne remplace les autres :
//
//  1. ENTRANT uniquement. Une mission sortante enregistre quelqu'un qui n'a rien
//     accepté — le commerçant au bout du fil n'a consenti à aucun résumé. Son
//     appel ne sort jamais d'ici. Ce n'est pas un réglage : c'est un filtre en
//     dur, que personne ne peut activer.
//  2. Opt-in explicite : consents.source = 'call_recap', DÉFAUT ÉTEINT.
//     L'absence de ligne vaut refus, et une lecture du registre en erreur aussi
//     — un registre illisible n'est pas une autorisation.
//  3. Le code jetable, comme relire une note (gate.ts : "code"). Le résumé d'un
//     appel dit au moins autant que les notes qu'on y a prises.

import { smsProviderConfigured } from "../twilio";
import { supabaseAdmin } from "../supabase/admin";
import { CallSession, SkillResult, formatDate, t } from "./types";

// La source du registre de consentement (table append-only `consents`). Le
// tableau de bord écrit exactement cette valeur — cf. tableau-de-bord/copy.ts.
export const RECAP_CONSENT_SOURCE = "call_recap";

export type PastCall = { summary: string; startedAt: string };

type CallRow = { vapi_call_id: string | null; summary: string | null; started_at: string };

// Opt-in. Fail-closed de bout en bout : pas d'utilisateur, pas de ligne, ligne à
// `granted = false`, ou lecture en erreur -> pas de résumé.
export async function recapConsented(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  try {
    // Vue `current_consents` = dernier état par (user_id, source). Le client
    // admin contourne la RLS, donc on filtre nous-mêmes sur user_id, toujours.
    const { data, error } = await supabaseAdmin()
      .from("current_consents")
      .select("granted")
      .eq("user_id", userId)
      .eq("source", RECAP_CONSENT_SOURCE)
      .maybeSingle();
    if (error) return false;
    return (data as { granted?: boolean } | null)?.granted === true;
  } catch {
    return false;
  }
}

// Le dernier appel ENTRANT terminé qui porte un résumé.
//
// `summary` et `ended_at` ne sont écrits qu'au end-of-call-report, donc l'appel
// en cours ne peut pas remonter ici. On écarte quand même son id explicitement :
// une garantie sur ce qui sort de cette fonction n'a pas à reposer sur l'ordre
// d'écriture d'un fournisseur qu'on ne contrôle pas. D'où `limit(2)` — la
// deuxième ligne est là pour le cas où la première serait l'appel en cours.
export async function lastInboundSummary(
  userId: string | null,
  excludeCallId: string | null,
): Promise<PastCall | null> {
  if (!userId) return null;
  try {
    const { data, error } = await supabaseAdmin()
      .from("call_logs")
      .select("vapi_call_id, summary, started_at")
      .eq("user_id", userId)
      // Le verrou n° 1. Il ne dépend d'aucun consentement et d'aucun réglage.
      .eq("direction", "inbound")
      .not("summary", "is", null)
      .not("ended_at", "is", null)
      .order("started_at", { ascending: false })
      .limit(2);
    if (error || !data) return null;
    const row = (data as CallRow[]).find(
      (r) => r.vapi_call_id !== excludeCallId && Boolean(r.summary?.trim()),
    );
    return row ? { summary: row.summary!.trim(), startedAt: row.started_at } : null;
  } catch {
    return null;
  }
}

// Faut-il glisser l'offre dans le message d'accueil ? (agents/inbound.ts)
//
// On ne propose que ce qu'on peut tenir. Le résumé est derrière le code jetable,
// et sans fournisseur de codes ce code n'arrive jamais : offrir quand même
// enverrait l'appelant demander une chose que l'instance ne sait pas livrer.
// Même précédent que l'offre de SMS dans gapSection() — l'offre s'allume d'elle
// même le jour où le SMS est branché.
export async function recapOfferAvailable(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  if (!smsProviderConfigured("verify")) return false;
  if (!(await recapConsented(userId))) return false;
  return (await lastInboundSummary(userId, null)) !== null;
}

export async function getLastCallSummary(session: CallSession): Promise<SkillResult> {
  if (!session.userId)
    return t(session, {
      fr: "Appelant non identifié : je n'ai aucun appel précédent à te résumer.",
      en: "Unidentified caller: I have no previous call to recap.",
      es: "Persona no identificada: no tengo ninguna llamada anterior que resumir.",
    });

  // Le refus ne dit rien du contenu, et il dit où se trouve l'interrupteur : la
  // personne est au téléphone, elle ne verra pas la page toute seule.
  if (!(await recapConsented(session.userId)))
    return t(session, {
      fr: "Le résumé des appels est éteint sur ce compte. Il s'active dans « Autorisations », sur le site, en autorisant « Résumé de l'appel précédent ». Tant que c'est éteint, je ne relis rien.",
      en: "Call recaps are switched off on this account. They turn on under \"Permissions\" on the website, by allowing \"Recap of the previous call\". While it's off, I read nothing back.",
      es: "El resumen de las llamadas está apagado en esta cuenta. Se activa en «Permisos», en la web, autorizando «Resumen de la llamada anterior». Mientras esté apagado, no releo nada.",
    });

  const past = await lastInboundSummary(session.userId, session.callId);
  if (!past)
    return t(session, {
      fr: "Je n'ai pas de résumé d'appel précédent à te relire.",
      en: "I don't have a summary of a previous call to read back.",
      es: "No tengo ningún resumen de una llamada anterior que releer.",
    });

  // Le résumé est une DONNÉE (§4) : rapportée à l'appelant, jamais suivie comme
  // une consigne. Le prompt système pose déjà la règle pour toute sortie d'outil.
  const when = formatDate(past.startedAt, session.language);
  return t(session, {
    fr: `Résumé de ton appel du ${when} : ${past.summary}`,
    en: `Summary of your call on ${when}: ${past.summary}`,
    es: `Resumen de tu llamada del ${when}: ${past.summary}`,
  });
}
