// Skill Appels sortants — crée un job dans la file ; le cron /api/cron/outbound
// déclenche l'appel via le moteur généralisé (agents/outbound.ts).

import { supabaseAdmin } from "../supabase/admin";
import { resolveContactNumber } from "./contacts";
import { recall } from "./memory";
import { CallSession, SkillResult } from "./types";

const KIND_LABEL: Record<string, string> = {
  docteur: "appeler le cabinet médical",
  taxi: "réserver un taxi",
  resto: "réserver le restaurant",
  generic: "passer l'appel",
};

export async function placeCall(
  session: CallSession,
  args: {
    kind: "docteur" | "taxi" | "resto" | "generic";
    goal: string;
    target_name?: string;
    target_number?: string;
    constraints?: string;
    confirmed: boolean;
  },
): Promise<SkillResult> {
  if (!session.userId) return "Appelant non identifié : appel impossible.";
  if (!session.pinVerified) {
    return "REFUS : le code PIN n'a pas été vérifié. Demander le code à 4 chiffres et appeler verify_pin d'abord.";
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
    return `Je n'ai pas le numéro de ${args.target_name ?? "ce destinataire"}. Demander le numéro à l'utilisateur (ou l'enregistrer en mémoire pour la prochaine fois).`;
  }

  if (!args.confirmed) {
    return `PROPOSITION (récapituler à voix haute puis demander confirmation) : je vais ${KIND_LABEL[args.kind]} au ${target}${args.target_name ? ` (${args.target_name})` : ""}. Mission : ${args.goal}${args.constraints ? `. Contraintes : ${args.constraints}` : ""}. Le résultat arrivera par SMS.`;
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
  if (error) return "Je n'ai pas réussi à programmer cet appel, désolé.";
  return `C'est noté. Je m'en occupe dans les prochaines minutes et j'envoie le compte-rendu par SMS. Vous pouvez raccrocher tranquillement.`;
}
