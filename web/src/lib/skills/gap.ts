// Skill « capacité manquante » : quand l'appelant demande quelque chose qu'aucun
// autre outil ne couvre, on note le manque (table capability_gaps) et le cron
// quotidien /api/cron/reports en fait un e-mail avec un prompt de correction.
// Ne bloque JAMAIS l'appel : une insertion ratée est loguée, jamais propagée
// (un manque perdu vaut mieux qu'un appel cassé).

import { supabaseAdmin } from "../supabase/admin";
import { smsProviderConfigured } from "../twilio";
import { CallSession, SkillResult, t } from "./types";

export async function reportGap(
  session: CallSession,
  args: { request_summary: string; caller_words?: string; language?: string; notify_caller?: boolean },
): Promise<SkillResult> {
  // On ne promet un SMS que si l'appelant a un numéro ET que l'envoi est
  // configuré. Sinon notify_caller retombe à false : pas de promesse fantôme.
  const canNotify = Boolean(session.callerNumber) && smsProviderConfigured("send");
  const notifyCaller = Boolean(args.notify_caller) && canNotify;

  try {
    const { error } = await supabaseAdmin()
      .from("capability_gaps")
      .insert({
        call_id: session.callId,
        user_id: session.userId,
        caller_number: session.callerNumber,
        language: args.language ?? session.language,
        request_summary: args.request_summary,
        caller_words: args.caller_words ?? null,
        notify_caller: notifyCaller,
      });
    if (error) console.error("capability_gaps insert", error);
  } catch (err) {
    console.error("reportGap", err);
  }

  if (notifyCaller) {
    return t(session, {
      fr: "C'est noté, je t'enverrai un SMS dès que ce sera disponible.",
      en: "Noted — I'll text you as soon as it's available.",
    });
  }
  return t(session, {
    fr: "C'est noté, ce sera ajouté.",
    en: "Noted, it'll be added.",
  });
}
