// Cron quotidien (05:00 Paris via pg_cron, cf. 0009_capability_gaps.sql).
// Deux balayages indépendants en une requête :
//   A. digest e-mail au mainteneur (manques en attente) ;
//   B. SMS « c'est disponible » aux appelants qui l'ont demandé, pour les manques
//      que le mainteneur a marqués resolved_at. Dormant tant qu'aucun fournisseur
//      SMS n'est branché — les lignes réessaient au prochain passage.

import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { sendEmail } from "@/lib/email";
import { envOr } from "@/lib/env";
import { buildDigestEmail } from "@/lib/reports/digest";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendSms } from "@/lib/twilio";

export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = envOr("CRON_SECRET", "");
  if (!secret || !safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ error: "non autorisé" }, { status: 401 });
  }

  const db = supabaseAdmin();

  // — Balayage A : digest e-mail —
  let emailed = 0;
  const { data: pending } = await db
    .from("capability_gaps")
    .select("id, created_at, request_summary, caller_words, language, notify_caller")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(100);

  if (pending && pending.length > 0) {
    const ids = pending.map((g) => g.id);
    const { subject, text } = buildDigestEmail(pending);
    try {
      await sendEmail({ subject, text });
      await db
        .from("capability_gaps")
        .update({ status: "sent", notified_at: new Date().toISOString() })
        .in("id", ids);
      emailed = pending.length;
    } catch (err) {
      // On laisse les lignes en 'pending' pour réessayer demain ; on note l'erreur.
      console.error("digest email", err);
      await db.from("capability_gaps").update({ error: String(err).slice(0, 300) }).in("id", ids);
    }
  }

  // — Balayage B : SMS « c'est disponible » —
  let texted = 0;
  const { data: resolved } = await db
    .from("capability_gaps")
    .select("id, caller_number, language")
    .not("resolved_at", "is", null)
    .eq("notify_caller", true)
    .is("caller_notified_at", null)
    .not("caller_number", "is", null)
    .limit(50);

  for (const g of resolved ?? []) {
    const body =
      g.language === "en"
        ? "Good news — the thing you asked our voice agent for is available now. Call back and try it."
        : g.language === "es"
          ? "Buena noticia — lo que le pediste a nuestro agente ya está disponible. Vuelve a llamar para probarlo."
          : "Bonne nouvelle — ce que tu avais demandé à notre agent est disponible. Rappelle pour l'essayer.";
    try {
      await sendSms({ to: g.caller_number as string, body, kind: "gap_resolved" });
      await db.from("capability_gaps").update({ caller_notified_at: new Date().toISOString() }).eq("id", g.id);
      texted++;
    } catch (err) {
      // Ex. Twilio pas encore branché : on retentera au prochain passage.
      console.error("gap_resolved sms", g.id, err);
      continue;
    }
  }

  return NextResponse.json({ emailed, texted });
}
