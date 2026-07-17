// Skill Auth — code jetable (Twilio Verify) envoyé au NUMÉRO ENREGISTRÉ de la
// personne, jamais au caller-ID (spoofable). Débloque les fonctions protégées
// pour la durée de l'appel. Fail-closed : sans fournisseur SMS branché, aucun
// code ne part et les fonctions protégées restent verrouillées — mais on le DIT,
// au lieu de laisser croire à une panne passagère.

import {
  checkPhoneVerification,
  smsProviderConfigured,
  startPhoneVerification,
  warnSmsProviderMissing,
} from "../twilio";
import { supabaseAdmin } from "../supabase/admin";
import { CallSession, SkillResult, t } from "./types";

// L'envoi de codes n'est pas configuré : état permanent et identique des deux
// côtés du code (demande ET vérification). Ne nomme que le chemin « verify » :
// « send » se configure séparément et peut très bien marcher ici.
function codeSendingUnavailable(session: CallSession): SkillResult {
  return t(session, {
    fr: "INDISPONIBLE : l'envoi de codes n'est pas configuré sur cette instance, le code ne peut pas être envoyé. Ce n'est pas une panne passagère : ne propose pas de réessayer. Dis-le honnêtement, les données personnelles restent verrouillées tant que l'envoi de codes n'est pas configuré.",
    en: "UNAVAILABLE: one-time code sending is not configured on this instance, so the code cannot be sent. This is not a temporary glitch: do not offer to retry. Say so honestly, personal data stays locked until one-time code sending is configured.",
    es: "NO DISPONIBLE: el envío de códigos no está configurado en esta instancia, el código no puede enviarse. No es una avería pasajera: no propongas reintentar. Dilo honestamente, los datos personales siguen bloqueados mientras el envío de códigos no esté configurado.",
  });
}

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
  if (!session.userId) return t(session, { fr: "Appelant non identifié.", en: "Unidentified caller.", es: "Persona no identificada." });
  // Rien de branché : état permanent, pas un incident. On le distingue du catch
  // plus bas, sinon l'agent propose de réessayer un envoi qui n'aura jamais lieu.
  if (!smsProviderConfigured("verify")) {
    warnSmsProviderMissing(`code demandé pendant l'appel ${session.callId}`);
    return codeSendingUnavailable(session);
  }
  const e164 = await registeredNumber(session.userId);
  if (!e164)
    return t(session, {
      fr: "Aucun numéro vérifié sur ce compte.",
      en: "No verified number on this account.",
      es: "Ningún número verificado en esta cuenta.",
    });
  try {
    // Twilio Verify borne lui-même le nombre d'envois et la durée de validité.
    await startPhoneVerification(e164);
  } catch (err) {
    // Vraie panne d'envoi : le fournisseur est bien branché mais n'a pas pris
    // le SMS. Réessayer a du sens, contrairement au cas ci-dessus.
    console.error("Envoi du code", err);
    return t(session, {
      fr: "L'envoi du code a échoué. Propose de réessayer dans un instant.",
      en: "Sending the code failed. Offer to try again in a moment.",
      es: "El envío del código ha fallado. Propón reintentarlo en un momento.",
    });
  }
  return t(session, {
    fr: "Je viens de t'envoyer un code à 4 chiffres par SMS. Dis-le-moi, ou tape-le sur ton clavier puis dièse.",
    en: "I just texted you a 4-digit code. Say it, or type it on your keypad then press pound.",
    es: "Te acabo de enviar un código de 4 cifras por SMS. Dímelo, o tecléalo en tu teléfono y pulsa almohadilla.",
  });
}

export async function verifyCode(session: CallSession, args: { code: string }): Promise<SkillResult> {
  if (!session.userId) return t(session, { fr: "Appelant non identifié.", en: "Unidentified caller.", es: "Persona no identificada." });
  // Même garde qu'à la demande. Sans elle, checkPhoneVerification appelle env()
  // qui lève, le catch plus bas l'aplatit en « Code incorrect », et la personne
  // rappelle des chiffres corrects contre une instance qui n'a jamais pu lui en
  // envoyer. Un défaut de configuration ne doit pas prendre le visage d'une
  // erreur de l'appelant.
  if (!smsProviderConfigured("verify")) {
    warnSmsProviderMissing(`code vérifié pendant l'appel ${session.callId}`);
    return codeSendingUnavailable(session);
  }
  const e164 = await registeredNumber(session.userId);
  if (!e164) return t(session, { fr: "Aucun numéro vérifié.", en: "No verified number.", es: "Ningún número verificado." });
  const cleaned = (args.code ?? "").replace(/\D/g, "");
  let ok = false;
  try {
    ok = await checkPhoneVerification(e164, cleaned);
  } catch (err) {
    // Fournisseur branché mais en panne : on ne peut pas conclure. Le refus
    // reste le même côté appelant (rien ne se débloque), mais il est tracé pour
    // ne pas se lire comme une salve de codes faux.
    console.error("Vérification du code", err);
    ok = false;
  }
  if (!ok) return t(session, { fr: "Code incorrect.", en: "Wrong code.", es: "Código incorrecto." });
  await supabaseAdmin().from("call_logs").update({ pin_verified: true }).eq("vapi_call_id", session.callId);
  session.verified = true;
  return t(session, {
    fr: "Code correct. C'est débloqué pour cet appel.",
    en: "Correct code. Unlocked for this call.",
    es: "Código correcto. Queda desbloqueado para esta llamada.",
  });
}
