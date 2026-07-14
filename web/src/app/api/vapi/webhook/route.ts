// Webhook Vapi — cœur téléphonique de la plateforme.
// Reçoit : assistant-request (appel entrant -> qui appelle ?), tool-calls
// (l'agent veut agir), end-of-call-report (transcript + clôture des missions).

import { NextResponse } from "next/server";
import { buildInboundAssistant, CallerContext } from "@/lib/agents/inbound";
import { executeTool } from "@/lib/skills";
import { closeJobWithoutReport, handleReportOutcome } from "@/lib/skills/outbound-report";
import { CallSession } from "@/lib/skills/types";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isValidVapiRequest } from "@/lib/vapi";

export const maxDuration = 60;

/* eslint-disable @typescript-eslint/no-explicit-any */

async function callerContextFor(phoneE164: string | null, language?: string | null): Promise<CallerContext & { fullName: string | null }> {
  const empty = { userId: null, preferredName: null, homeAddress: null, memories: [], pinConfigured: false, fullName: null, language };
  if (!phoneE164) return empty;
  const db = supabaseAdmin();
  const { data: phone } = await db
    .from("phones")
    .select("user_id")
    .eq("e164", phoneE164)
    .not("verified_at", "is", null)
    .maybeSingle();
  if (!phone) return empty;
  const [{ data: profile }, { data: memories }] = await Promise.all([
    db.from("profiles").select("full_name, preferred_name, home_address, pin_hash").eq("id", phone.user_id).single(),
    db.from("memories").select("key, value").eq("user_id", phone.user_id).limit(30),
  ]);
  return {
    userId: phone.user_id,
    preferredName: profile?.preferred_name || profile?.full_name || null,
    fullName: profile?.full_name ?? null,
    homeAddress: profile?.home_address ?? null,
    memories: memories ?? [],
    pinConfigured: Boolean(profile?.pin_hash),
    language,
  };
}

async function sessionFor(callId: string, language?: string | null): Promise<CallSession> {
  const { data } = await supabaseAdmin()
    .from("call_logs")
    .select("user_id, from_number, pin_verified, direction")
    .eq("vapi_call_id", callId)
    .maybeSingle();
  return {
    callId,
    userId: data?.user_id ?? null,
    callerNumber: data?.from_number ?? null,
    pinVerified: data?.pin_verified ?? false,
    language,
  };
}

export async function POST(req: Request) {
  if (!isValidVapiRequest(req)) {
    return NextResponse.json({ error: "signature invalide" }, { status: 401 });
  }
  const payload = (await req.json()) as any;
  const message = payload?.message;
  const call = message?.call;
  const callId: string | undefined = call?.id;

  switch (message?.type) {
    // ------------------------------------------------------------------
    // Appel entrant : qui appelle ? -> assistant personnalisé (mémoire, prénom)
    // ------------------------------------------------------------------
    case "assistant-request": {
      const callerNumber: string | null = call?.customer?.number ?? null;
      const callerLanguage = (call?.metadata?.language ?? payload?.language ?? message?.language ?? null) as string | null;
      const ctx = await callerContextFor(callerNumber, callerLanguage);
      if (callId) {
        await supabaseAdmin().from("call_logs").upsert(
          {
            vapi_call_id: callId,
            user_id: ctx.userId,
            direction: "inbound",
            agent: "assistant",
            from_number: callerNumber,
          },
          { onConflict: "vapi_call_id" },
        );
      }
      return NextResponse.json({ assistant: buildInboundAssistant(ctx) });
    }

    // ------------------------------------------------------------------
    // L'agent appelle un outil
    // ------------------------------------------------------------------
    case "tool-calls": {
      const toolCalls: any[] = message.toolCallList ?? message.toolCalls ?? [];
      if (!callId || toolCalls.length === 0) return NextResponse.json({ results: [] });

      const jobId: string | undefined = call?.metadata?.outbound_job_id;
      const callerLanguage = (call?.metadata?.language ?? payload?.language ?? message?.language ?? null) as string | null;
      const session = await sessionFor(callId, callerLanguage);

      const results = await Promise.all(
        toolCalls.map(async (tc) => {
          const name: string = tc.name ?? tc.function?.name;
          let args: any = tc.arguments ?? tc.function?.arguments ?? {};
          if (typeof args === "string") {
            try {
              args = JSON.parse(args);
            } catch {
              args = {};
            }
          }
          const result =
            name === "report_outcome" && jobId
              ? await handleReportOutcome(jobId, args)
              : await executeTool(name, args, session);
          return { toolCallId: tc.id, result };
        }),
      );
      return NextResponse.json({ results });
    }

    // ------------------------------------------------------------------
    // Fin d'appel : transcript, résumé, clôture des missions sans compte-rendu
    // ------------------------------------------------------------------
    case "end-of-call-report": {
      if (!callId) break;
      const db = supabaseAdmin();
      await db
        .from("call_logs")
        .update({
          transcript: message.artifact?.transcript ?? message.transcript ?? null,
          summary: message.analysis?.summary ?? null,
          ended_at: new Date().toISOString(),
          ended_reason: message.endedReason ?? null,
        })
        .eq("vapi_call_id", callId);

      // Mission sortante terminée sans report_outcome (raccroché, échec…) :
      // remise en file ou abandon (logique partagée avec le runtime self-host).
      const jobId: string | undefined = call?.metadata?.outbound_job_id;
      if (jobId) await closeJobWithoutReport(jobId);
      break;
    }

    default:
      break;
  }
  return NextResponse.json({ ok: true });
}
