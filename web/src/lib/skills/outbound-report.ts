// Clôture des missions sortantes — partagé entre le webhook Vapi et le
// runtime self-host : compte-rendu (report_outcome) et fin d'appel sans rapport.

import { supabaseAdmin } from "../supabase/admin";
import { sendSms } from "../twilio";

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
  if (job.callback_number) {
    const prefix = args.status === "success" ? "✅" : args.status === "voicemail" ? "📞 Répondeur —" : "⚠️";
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
    await sendSms({
      to: job.callback_number,
      body: "⚠️ Je n'ai pas réussi à joindre le destinataire malgré plusieurs essais. On réessaiera plus tard.",
      userId: job.user_id,
      kind: "outbound_report",
    });
  }
}
