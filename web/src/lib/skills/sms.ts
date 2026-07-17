// Skill Messages — SMS dicté, avec relecture (confirm) + code jetable (action sensible).

import { isE164 } from "../phone";
import { sendSms, smsProviderConfigured, warnSmsProviderMissing } from "../twilio";
import { resolveContactNumber } from "./contacts";
import { CallSession, SkillResult, t } from "./types";

export async function sendDictatedSms(
  session: CallSession,
  args: { to_name?: string; to_number?: string; body: string; confirmed: boolean },
): Promise<SkillResult> {
  if (!session.userId)
    return t(session, {
      fr: "Appelant non identifié : envoi impossible.",
      en: "Unidentified caller: can't send.",
      es: "Persona no identificada: envío imposible.",
    });
  // Vérifié AVANT la relecture : faire relire un message qui ne partira jamais
  // est la pire des issues pour la personne au bout du fil.
  if (!smsProviderConfigured("send")) {
    warnSmsProviderMissing(`SMS dicté pendant l'appel ${session.callId}`);
    return t(session, {
      fr: "INDISPONIBLE : aucun fournisseur SMS n'est branché sur cette instance, aucun message ne peut partir. Ne relis pas le message, ne propose pas de réessayer : dis honnêtement que l'envoi de SMS est hors service ici.",
      en: "UNAVAILABLE: no SMS provider is connected on this instance, no message can go out. Don't read the message back, don't offer to retry: say honestly that sending SMS is out of service here.",
      es: "NO DISPONIBLE: no hay ningún proveedor de SMS conectado en esta instancia, ningún mensaje puede salir. No releas el mensaje, no propongas reintentar: di honestamente que el envío de SMS está fuera de servicio aquí.",
    });
  }
  if (!session.verified) {
    return t(session, {
      fr: "REFUS : le code n'a pas été vérifié. Appelle request_code puis verify_code d'abord.",
      en: "REFUSED: the code hasn't been verified. Call request_code then verify_code first.",
      es: "RECHAZADO: el código no se ha verificado. Llama primero a request_code y luego a verify_code.",
    });
  }

  let to = args.to_number ?? null;
  let label = args.to_number ?? "";
  if (!to && args.to_name) {
    to = await resolveContactNumber(session, args.to_name);
    label = args.to_name;
    if (!to)
      return t(session, {
        fr: `Je ne trouve pas de numéro pour « ${args.to_name} » dans les contacts.`,
        en: `I can't find a number for "${args.to_name}" in the contacts.`,
        es: `No encuentro ningún número para «${args.to_name}» en los contactos.`,
      });
  }
  if (!to)
    return t(session, {
      fr: "Il me faut un destinataire : un nom de contact ou un numéro.",
      en: "I need a recipient: a contact name or a number.",
      es: "Necesito un destinatario: un nombre de contacto o un número.",
    });
  if (!isE164(to))
    return t(session, {
      fr: "Ce numéro n'est pas au bon format (indicatif international). Je préfère ne pas envoyer.",
      en: "That number isn't in the right format (international dialing code). I'd rather not send.",
      es: "Ese número no tiene el formato correcto (prefijo internacional). Prefiero no enviarlo.",
    });

  if (!args.confirmed) {
    return t(session, {
      fr: `PROPOSITION (relire le message à voix haute puis demander confirmation) : envoyer à ${label} (${to}) le SMS suivant : « ${args.body} »`,
      en: `PROPOSAL (read the message back out loud, then ask for confirmation): send to ${label} (${to}) the following SMS: "${args.body}"`,
      es: `PROPUESTA (releer el mensaje en voz alta y pedir confirmación): enviar a ${label} (${to}) el siguiente SMS: «${args.body}»`,
    });
  }
  await sendSms({ to, body: args.body, userId: session.userId, kind: "generic" });
  return t(session, {
    fr: `Le message est envoyé à ${label}.`,
    en: `The message has been sent to ${label}.`,
    es: `El mensaje se ha enviado a ${label}.`,
  });
}
