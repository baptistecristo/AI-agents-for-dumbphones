// Skill Sécurité — vérification du PIN parlé (§6 : le caller-ID est spoofable,
// les actions sensibles exigent un secret parlé).

import { verifyPin } from "../crypto";
import { supabaseAdmin } from "../supabase/admin";
import { CallSession, SkillResult } from "./types";

export async function checkPin(session: CallSession, args: { pin: string }): Promise<SkillResult> {
  if (!session.userId) return "Appelant non identifié.";
  const { data } = await supabaseAdmin()
    .from("profiles")
    .select("pin_hash")
    .eq("id", session.userId)
    .single();
  if (!data?.pin_hash) return "Aucun code n'est configuré sur ce compte (à faire sur le site).";

  const cleaned = args.pin.replace(/\D/g, "");
  if (cleaned.length !== 4 || !verifyPin(cleaned, data.pin_hash)) {
    return "Code incorrect.";
  }
  // Marque la session d'appel comme vérifiée (persiste entre les tool-calls)
  await supabaseAdmin().from("call_logs").update({ pin_verified: true }).eq("vapi_call_id", session.callId);
  session.pinVerified = true;
  return "Code correct. Les actions sensibles sont débloquées pour cet appel.";
}
