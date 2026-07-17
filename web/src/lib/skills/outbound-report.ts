// Clôture des missions sortantes — partagé entre le webhook Vapi et le
// runtime self-host : compte-rendu (report_outcome) et fin d'appel sans rapport.
// Les SMS envoyés au client suivent sa langue préférée (profiles.preferred_language).

import { Language, normalizeLanguage } from "../language";
import { supabaseAdmin } from "../supabase/admin";
import { sendSms, smsProviderConfigured, warnSmsProviderMissing } from "../twilio";

async function languageOf(userId: string | null): Promise<Language> {
  if (!userId) return "fr";
  const { data } = await supabaseAdmin()
    .from("profiles")
    .select("preferred_language")
    .eq("id", userId)
    .maybeSingle();
  return normalizeLanguage(data?.preferred_language);
}

export async function handleReportOutcome(
  jobId: string,
  args: { status: string; details: string },
): Promise<string> {
  const db = supabaseAdmin();
  const { data: job } = await db.from("outbound_jobs").select("*").eq("id", jobId).single();
  if (!job) return "Job introuvable.";
  const statusMap: Record<string, string> = {
    success: "done",
    failed: "failed",
    voicemail: "needs_user",
    needs_user: "needs_user",
  };
  await db
    .from("outbound_jobs")
    .update({
      status: statusMap[args.status] ?? "failed",
      result: args.details,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);
  // Le statut du job est déjà écrit : sans fournisseur SMS on perd le SMS, pas
  // le compte-rendu. On le dit à l'agent plutôt que de lever au milieu de sa
  // clôture d'appel.
  if (job.callback_number && !smsProviderConfigured("send")) {
    warnSmsProviderMissing(`compte-rendu du job ${jobId}`);
    return "Compte-rendu enregistré. Aucun fournisseur SMS n'est branché : le client ne recevra PAS de SMS. Tu peux raccrocher.";
  }
  if (job.callback_number) {
    const lang = await languageOf(job.user_id);
    const voicemail =
      lang === "en" ? "📞 Voicemail —" : lang === "es" ? "📞 Buzón de voz —" : "📞 Répondeur —";
    const prefix = args.status === "success" ? "✅" : args.status === "voicemail" ? voicemail : "⚠️";
    await sendSms({
      to: job.callback_number,
      body: `${prefix} ${args.details}`,
      userId: job.user_id,
      kind: "outbound_report",
    });
  }
  return "Compte-rendu transmis au client par SMS. Tu peux raccrocher.";
}

// Appel terminé sans report_outcome (raccroché, échec…) : remise en file ou
// abandon définitif après max_attempts, avec SMS d'excuse.
export async function closeJobWithoutReport(jobId: string): Promise<void> {
  const db = supabaseAdmin();
  const { data: job } = await db
    .from("outbound_jobs")
    .select("status, attempts, max_attempts, callback_number, user_id")
    .eq("id", jobId)
    .single();
  if (!job || job.status !== "calling") return;
  const exhausted = job.attempts >= job.max_attempts;
  await db
    .from("outbound_jobs")
    .update({ status: exhausted ? "failed" : "pending", updated_at: new Date().toISOString() })
    .eq("id", jobId);
  if (exhausted && job.callback_number) {
    // Personne à prévenir en direct ici : les logs sont le seul canal.
    if (!smsProviderConfigured("send")) {
      warnSmsProviderMissing(`SMS d'abandon du job ${jobId}`);
      return;
    }
    const lang = await languageOf(job.user_id);
    await sendSms({
      to: job.callback_number,
      body:
        lang === "en"
          ? "⚠️ I couldn't reach them despite several tries. We'll try again later."
          : lang === "es"
            ? "⚠️ No he conseguido contactar con el destinatario a pesar de varios intentos. Lo volveremos a intentar más tarde."
            : "⚠️ Je n'ai pas réussi à joindre le destinataire malgré plusieurs essais. On réessaiera plus tard.",
      userId: job.user_id,
      kind: "outbound_report",
    });
  }
}
