// Skill Messages — SMS dicté, avec relecture (confirm) + PIN (action sensible).

import { sendSms } from "../twilio";
import { resolveContactNumber } from "./contacts";
import { CallSession, SkillResult } from "./types";

export async function sendDictatedSms(
  session: CallSession,
  args: { to_name?: string; to_number?: string; body: string; confirmed: boolean },
): Promise<SkillResult> {
  if (!session.userId) return "Appelant non identifié : envoi impossible.";
  if (!session.pinVerified) {
    return "REFUS : le code PIN n'a pas été vérifié. Demander le code à 4 chiffres et appeler verify_pin d'abord.";
  }

  let to = args.to_number ?? null;
  let label = args.to_number ?? "";
  if (!to && args.to_name) {
    to = await resolveContactNumber(session, args.to_name);
    label = args.to_name;
    if (!to) return `Je ne trouve pas de numéro pour « ${args.to_name} » dans les contacts.`;
  }
  if (!to) return "Il me faut un destinataire : un nom de contact ou un numéro.";

  if (!args.confirmed) {
    return `PROPOSITION (relire le message à voix haute puis demander confirmation) : envoyer à ${label} (${to}) le SMS suivant : « ${args.body} »`;
  }
  await sendSms({ to, body: args.body, userId: session.userId, kind: "generic" });
  return `Le message est envoyé à ${label}.`;
}
