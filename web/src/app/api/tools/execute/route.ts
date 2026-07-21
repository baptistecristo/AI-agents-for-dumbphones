// Runtime self-host -> exécution d'un outil. La logique métier (skills, auth
// d'appel, consentements) vit ici, dans une seule implémentation, quel que soit
// le runtime vocal (Vapi ou Pipecat).

import { NextResponse } from "next/server";
import { callerIsTrusted } from "@/lib/consent";
import { safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { normalizeLanguage } from "@/lib/language";
import { executeTool } from "@/lib/skills";
import { handleReportOutcome } from "@/lib/skills/outbound-report";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const maxDuration = 60;

export async function POST(req: Request) {
  if (!safeEqual(req.headers.get("authorization") ?? "", `Bearer ${env("RUNTIME_API_SECRET")}`)) {
    return NextResponse.json({ error: "non autorisé" }, { status: 401 });
  }
  const body = (await req.json()) as {
    call_id: string;
    name: string;
    arguments: Record<string, unknown>;
    job_id?: string;
  };

  if (body.name === "report_outcome" && body.job_id) {
    const result = await handleReportOutcome(body.job_id, body.arguments as { status: string; details: string });
    return NextResponse.json({ result });
  }

  const { data } = await supabaseAdmin()
    .from("call_logs")
    .select("user_id, from_number, pin_verified, direction, language")
    .eq("vapi_call_id", body.call_id)
    .maybeSingle();

  const userId = data?.user_id ?? null;
  const callerNumber = data?.from_number ?? null;

  const result = await executeTool(body.name, body.arguments, {
    callId: body.call_id,
    channel: "voice",
    // Fail-closed comme sur le chemin Vapi : ce qui n'est pas lisiblement
    // "inbound" compte comme sortant, et les skills réservés à l'entrant
    // refusent.
    direction: data?.direction === "inbound" ? ("inbound" as const) : ("outbound" as const),
    userId,
    callerNumber,
    verified: data?.pin_verified ?? false,
    // Le grant appartient au numéro, pas au runtime : le même consentement vaut
    // ici et sur le chemin Vapi, et il est relu en base à chaque appel d'outil.
    trustedCaller: await callerIsTrusted(userId, callerNumber),
    language: normalizeLanguage(data?.language), // absent -> 'fr'
  });
  return NextResponse.json({ result });
}
