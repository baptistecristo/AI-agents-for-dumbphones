// Skill Appels sortants — crée un job dans la file ; le cron /api/cron/outbound
// déclenche l'appel via le moteur généralisé (agents/outbound.ts).

import { isE164 } from "../phone";
import { supabaseAdmin } from "../supabase/admin";
import { resolveContactNumber } from "./contacts";
import { recall } from "./memory";
import { CallSession, SkillResult, t } from "./types";

const KIND_LABEL: Record<string, { fr: string; en: string; es: string }> = {
  appointment: { fr: "appeler pour prendre le rendez-vous", en: "call to book the appointment", es: "llamar para pedir la cita" },
  taxi: { fr: "réserver un taxi", en: "book a taxi", es: "reservar un taxi" },
  resto: { fr: "réserver le restaurant", en: "book the restaurant", es: "reservar el restaurante" },
  generic: { fr: "passer l'appel", en: "place the call", es: "hacer la llamada" },
};

export async function placeCall(
  session: CallSession,
  args: {
    kind: "appointment" | "taxi" | "resto" | "generic";
    goal: string;
    target_name?: string;
    target_number?: string;
    constraints?: string;
    confirmed: boolean;
  },
): Promise<SkillResult> {
  if (!session.userId)
    return t(session, {
      fr: "Appelant non identifié : appel impossible.",
      en: "Unidentified caller: can't place a call.",
      es: "Persona no identificada: llamada imposible.",
    });
  if (!session.verified) {
    return t(session, {
      fr: "REFUS : le code n'a pas été vérifié. Appelle request_code puis verify_code d'abord.",
      en: "REFUSED: the code hasn't been verified. Call request_code then verify_code first.",
      es: "RECHAZADO: el código no se ha verificado. Llama primero a request_code y luego a verify_code.",
    });
  }

  // Résolution du numéro cible : argument direct > contacts Google > mémoire
  let target = args.target_number ?? null;
  if (!target && args.target_name) {
    target = await resolveContactNumber(session, args.target_name);
    if (!target) {
      const fromMemory = await recall(session, { query: args.target_name });
      const match = fromMemory.match(/(\+33\s?[\d\s.]{9,}|0[\d\s.]{9,})/);
      if (match) target = match[1].replace(/[\s.]/g, "").replace(/^0/, "+33");
    }
  }
  if (!target) {
    return t(session, {
      fr: `Je n'ai pas le numéro de ${args.target_name ?? "ce destinataire"}. Demander le numéro à l'utilisateur (ou l'enregistrer en mémoire pour la prochaine fois).`,
      en: `I don't have the number for ${args.target_name ?? "this recipient"}. Ask the user for the number (or save it to memory for next time).`,
      es: `No tengo el número de ${args.target_name ?? "ese destinatario"}. Pedir el número a la persona (o guardarlo en la memoria para la próxima vez).`,
    });
  }
  if (!isE164(target)) {
    return t(session, {
      fr: "Ce numéro n'est pas au bon format (indicatif international). Je préfère ne pas appeler.",
      en: "That number isn't in the right format (international dialing code). I'd rather not call.",
      es: "Ese número no tiene el formato correcto (prefijo internacional). Prefiero no llamar.",
    });
  }

  if (!args.confirmed) {
    const label = t(session, KIND_LABEL[args.kind] ?? KIND_LABEL.generic);
    return t(session, {
      fr: `PROPOSITION (récapituler à voix haute puis demander confirmation) : je vais ${label} au ${target}${args.target_name ? ` (${args.target_name})` : ""}. Mission : ${args.goal}${args.constraints ? `. Contraintes : ${args.constraints}` : ""}. Le résultat arrivera par SMS.`,
      en: `PROPOSAL (recap out loud, then ask for confirmation): I will ${label} at ${target}${args.target_name ? ` (${args.target_name})` : ""}. Mission: ${args.goal}${args.constraints ? `. Constraints: ${args.constraints}` : ""}. The result will arrive by SMS.`,
      es: `PROPUESTA (recapitular en voz alta y pedir confirmación): voy a ${label} al ${target}${args.target_name ? ` (${args.target_name})` : ""}. Misión: ${args.goal}${args.constraints ? `. Condiciones: ${args.constraints}` : ""}. El resultado llegará por SMS.`,
    });
  }

  const { error } = await supabaseAdmin().from("outbound_jobs").insert({
    user_id: session.userId,
    kind: args.kind,
    goal: args.goal,
    target_name: args.target_name ?? null,
    target_number: target,
    constraints: args.constraints ? { note: args.constraints } : {},
    callback_number: session.callerNumber ?? "",
  });
  if (error)
    return t(session, {
      fr: "Je n'ai pas réussi à programmer cet appel, désolé.",
      en: "I couldn't schedule that call, sorry.",
      es: "No he podido programar esa llamada, lo siento.",
    });
  return t(session, {
    fr: `C'est noté. Je m'en occupe dans les prochaines minutes et j'envoie le compte-rendu par SMS. Tu peux raccrocher tranquillement.`,
    en: `Done. I'll take care of it in the next few minutes and text you the outcome by SMS. You can hang up.`,
    es: `Anotado. Me encargo en los próximos minutos y te envío el resultado por SMS. Puedes colgar tranquilamente.`,
  });
}
