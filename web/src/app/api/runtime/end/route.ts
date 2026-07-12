// Runtime self-host -> fin d'appel : transcript + clôture d'une éventuelle
// mission sortante restée sans compte-rendu.

import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
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
  return NextResponse.json({ ok: true });
}
