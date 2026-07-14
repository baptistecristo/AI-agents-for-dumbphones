// Skill Auth — code jetable (Twilio Verify) envoyé au NUMÉRO ENREGISTRÉ de la
// personne, jamais au caller-ID (spoofable). Débloque les fonctions protégées
// pour la durée de l'appel. Fail-closed : si Twilio n'est pas configuré, l'envoi
// échoue proprement et les fonctions protégées restent verrouillées.

import { checkPhoneVerification, startPhoneVerification } from "../twilio";
import { supabaseAdmin } from "../supabase/admin";
import { CallSession, SkillResult, t } from "./types";

// Le numéro vérifié du compte : cible unique de l'OTP. On prend le plus ancien
// vérifié (stable), jamais un numéro fourni par l'appelant ou le LLM.
async function registeredNumber(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin()
    .from("phones")
    .select("e164")
    .eq("user_id", userId)
    .not("verified_at", "is", null)
    .order("verified_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.e164 ?? null;
}

export async function requestCode(session: CallSession): Promise<SkillResult> {
  if (!session.userId) return t(session, { fr: "Appelant non identifié.", en: "Unidentified caller." });
  const e164 = await registeredNumber(session.userId);
  if (!e164)
    return t(session, {
      fr: "Aucun numéro vérifié sur ce compte.",
      en: "No verified number on this account.",
    });
  try {
    // Twilio Verify borne lui-même le nombre d'envois et la durée de validité.
    await startPhoneVerification(e164);
  } catch {
    return t(session, {
      fr: "L'envoi du code est indisponible pour le moment.",
      en: "Sending the code is unavailable right now.",
    });
  }
  return t(session, {
    fr: "Je viens de t'envoyer un code à 4 chiffres par SMS. Dis-le-moi, ou tape-le sur ton clavier.",
    en: "I just texted you a 4-digit code. Say it, or type it on your keypad.",
  });
}

export async function verifyCode(session: CallSession, args: { code: string }): Promise<SkillResult> {
  if (!session.userId) return t(session, { fr: "Appelant non identifié.", en: "Unidentified caller." });
  const e164 = await registeredNumber(session.userId);
  if (!e164) return t(session, { fr: "Aucun numéro vérifié.", en: "No verified number." });
  const cleaned = (args.code ?? "").replace(/\D/g, "");
  let ok = false;
  try {
    ok = await checkPhoneVerification(e164, cleaned);
  } catch {
    ok = false;
  }
  if (!ok) return t(session, { fr: "Code incorrect.", en: "Wrong code." });
  await supabaseAdmin().from("call_logs").update({ pin_verified: true }).eq("vapi_call_id", session.callId);
  session.verified = true;
  return t(session, {
    fr: "Code correct. C'est débloqué pour cet appel.",
    en: "Correct code. Unlocked for this call.",
  });
}
