// Runtime self-host -> fin d'appel : transcript + clôture d'une éventuelle
// mission sortante restée sans compte-rendu.

import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { extractCallActionItems } from "@/lib/reports/action-items";
import { closeJobWithoutReport } from "@/lib/skills/outbound-report";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  if (!safeEqual(req.headers.get("authorization") ?? "", `Bearer ${env("RUNTIME_API_SECRET")}`)) {
    return NextResponse.json({ error: "non autorisé" }, { status: 401 });
  }
  const body = (await req.json()) as {
    call_id: string;
    transcript?: string;
    ended_reason?: string;
    job_id?: string;
  };

  await supabaseAdmin()
    .from("call_logs")
    .update({
      transcript: body.transcript ?? null,
      ended_at: new Date().toISOString(),
      ended_reason: body.ended_reason ?? "hangup",
    })
    .eq("vapi_call_id", body.call_id);

  if (body.job_id) await closeJobWithoutReport(body.job_id);

  // Engagements pris pendant l'appel -> rappels, comme sur le chemin Vapi.
  // L'extraction lit le transcript écrit juste au-dessus et décide seule
  // (appel entrant + consentement action_items, cf. reports/action-items.ts).
  // L'appel est fini : cette étape ne doit jamais faire échouer la clôture.
  // (call_logs.summary n'a pas d'équivalent self-host : le récap du dernier
  // appel reste propre au chemin Vapi tant que ce runtime ne résume pas.)
  try {
    await extractCallActionItems(body.call_id);
  } catch (err) {
    console.error("Extraction des engagements en erreur", err);
  }
  return NextResponse.json({ ok: true });
}
