// Webhook Vapi — cœur téléphonique de la plateforme.
// Reçoit : assistant-request (appel entrant -> qui appelle ?), tool-calls
// (l'agent veut agir), end-of-call-report (transcript + clôture des missions).

import { NextResponse } from "next/server";
import { buildInboundAssistant, CallerContext } from "@/lib/agents/inbound";
import { defaultLanguage, normalizeLanguage } from "@/lib/language";
import { inboundRateVerdict, rateLimitMessage } from "@/lib/rate-limit";
import { executeTool } from "@/lib/skills";
import { closeJobWithoutReport, handleReportOutcome } from "@/lib/skills/outbound-report";
import { CallSession } from "@/lib/skills/types";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isValidVapiRequest } from "@/lib/vapi";

export const maxDuration = 60;

/* eslint-disable @typescript-eslint/no-explicit-any */

// Le caller-ID identifie la personne (pour savoir à quel numéro envoyer le code),
// mais ne débloque RIEN de sensible : aucune donnée perso (adresse, mémoires) n'est
// préchargée dans le prompt. L'agent lit ces données via des outils, une fois le
// code vérifié.
async function callerContextFor(phoneE164: string | null): Promise<CallerContext> {
  const empty: CallerContext = {
    userId: null,
    preferredName: null,
    language: defaultLanguage(), // appelant inconnu -> env DEFAULT_LANGUAGE
  };
  if (!phoneE164) return empty;
  const db = supabaseAdmin();
  const { data: phone } = await db
    .from("phones")
    .select("user_id")
    .eq("e164", phoneE164)
    .not("verified_at", "is", null)
    .maybeSingle();
  if (!phone) return empty;
  const { data: profile } = await db
    .from("profiles")
    .select("full_name, preferred_name, preferred_language")
    .eq("id", phone.user_id)
    .single();
  return {
    userId: phone.user_id,
    preferredName: profile?.preferred_name || profile?.full_name || null,
    language: normalizeLanguage(profile?.preferred_language),
  };
}

async function sessionFor(callId: string): Promise<CallSession> {
  const { data } = await supabaseAdmin()
    .from("call_logs")
    .select("user_id, from_number, pin_verified, direction, language")
    .eq("vapi_call_id", callId)
    .maybeSingle();
  return {
    callId,
    userId: data?.user_id ?? null,
    callerNumber: data?.from_number ?? null,
    verified: data?.pin_verified ?? false,
    language: normalizeLanguage(data?.language),
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
      const ctx = await callerContextFor(callerNumber);

      // Le numéro est public : borner le nombre d'appels, pas seulement leur
      // durée. Un appel refusé n'est PAS journalisé, sinon un appelant abusif
      // remplirait le plafond global avec des rejets et empêcherait les autres
      // d'appeler. Seuls les appels réellement connectés — ceux qui coûtent —
      // comptent.
      const verdict = await inboundRateVerdict(callerNumber);
      if (!verdict.allowed) {
        return NextResponse.json({ error: rateLimitMessage(verdict.scope, ctx.language) });
      }

      if (callId) {
        await supabaseAdmin().from("call_logs").upsert(
          {
            vapi_call_id: callId,
            user_id: ctx.userId,
            direction: "inbound",
            agent: "assistant",
            from_number: callerNumber,
            language: ctx.language,
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
      const session = await sessionFor(callId);

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
