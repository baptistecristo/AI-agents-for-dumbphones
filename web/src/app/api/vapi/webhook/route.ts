// Webhook Vapi — cœur téléphonique de la plateforme.
// Reçoit : assistant-request (appel entrant -> qui appelle ?), tool-calls
// (l'agent veut agir), end-of-call-report (transcript + clôture des missions).

import { NextResponse } from "next/server";
import { buildInboundAssistant, CallerContext } from "@/lib/agents/inbound";
import { callerIsTrusted } from "@/lib/consent";
import { defaultLanguage, normalizeLanguage } from "@/lib/language";
import { agentInstructionsOf } from "@/lib/profile";
import { inboundRateVerdict, rateLimitMessage } from "@/lib/rate-limit";
import { extractCallActionItems } from "@/lib/reports/action-items";
import { executeTool } from "@/lib/skills";
import { closeJobWithoutReport, handleReportOutcome } from "@/lib/skills/outbound-report";
import { recapOfferAvailable } from "@/lib/skills/recap";
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
    voiceSpeed: null, // appelant inconnu -> aucun réglage à appliquer
    agentInstructions: null, // appelant inconnu -> aucune consigne à appliquer
    recapOffer: false, // appelant inconnu -> rien à lui résumer
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
    .select("full_name, preferred_name, preferred_language, voice_speed")
    .eq("id", phone.user_id)
    .single();
  return {
    userId: phone.user_id,
    preferredName: profile?.preferred_name || profile?.full_name || null,
    language: normalizeLanguage(profile?.preferred_language),
    // Le débit réglé par la personne : c'est ici, et seulement ici, qu'on sait
    // qui appelle. buildInboundAssistant borne la valeur avant l'envoi.
    voiceSpeed: profile?.voice_speed ?? null,
    // Consignes libres de la personne : lecture tolérante (0009 peut ne pas
    // encore être appliqué), donc un défaut d'accès retombe sur « aucune ».
    agentInstructions: await agentInstructionsOf(phone.user_id),
    // Offre de résumé dans l'accueil. Court-circuité dès qu'aucun code ne peut
    // partir, donc zéro requête de plus sur une instance sans SMS.
    recapOffer: await recapOfferAvailable(phone.user_id),
  };
}

// Reconstruite à CHAQUE message tool-calls, jamais gardée entre deux. C'est ce
// qui fait que le grant « appelant de confiance » se révoque pour de bon : il
// est relu ici, en base, au même titre que le code jetable de l'appel. Rien de
// ce grant n'est passé à l'assistant ni retenu ailleurs.
async function sessionFor(callId: string): Promise<CallSession> {
  const { data } = await supabaseAdmin()
    .from("call_logs")
    .select("user_id, from_number, pin_verified, direction, language")
    .eq("vapi_call_id", callId)
    .maybeSingle();
  const userId = data?.user_id ?? null;
  const callerNumber = data?.from_number ?? null;
  return {
    callId,
    channel: "voice",
    userId,
    callerNumber,
    verified: data?.pin_verified ?? false,
    // user_id n'est renseigné que si le numéro correspond à un phones vérifié
    // (callerContextFor) : un appelant inconnu n'a donc aucun grant à trouver.
    trustedCaller: await callerIsTrusted(userId, callerNumber),
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

      // Engagements pris pendant l'appel -> rappels. Ne lit le transcript que
      // pour un appel ENTRANT dont l'appelant a explicitement autorisé la
      // source « action_items » (défaut : refusé) — tout est décidé dans
      // reports/action-items.ts. L'appel est terminé : cette étape ne doit
      // jamais faire échouer le webhook, d'où le try/catch.
      try {
        await extractCallActionItems(callId);
      } catch (err) {
        console.error("Extraction des engagements en erreur", err);
      }
      break;
    }

    default:
      break;
  }
  return NextResponse.json({ ok: true });
}
