// Cron (toutes les minutes) : dépile la file d'appels sortants et lance les
// missions via le moteur généralisé. Un worker séparé de la ligne entrante
// (§7 : un appel de 4 minutes ne doit jamais bloquer l'entrant).

import { NextResponse } from "next/server";
import { buildOutboundAssistant, OutboundJob } from "@/lib/agents/outbound";
import { safeEqual } from "@/lib/crypto";
import { env, envOr } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { startOutboundCall } from "@/lib/vapi";

export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = envOr("CRON_SECRET", "");
  if (!secret || !safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ error: "non autorisé" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const { data: jobs } = await db
    .from("outbound_jobs")
    .select("*")
    .eq("status", "pending")
    .lt("attempts", 3)
    .order("created_at", { ascending: true })
    .limit(3);

  let launched = 0;
  for (const job of jobs ?? []) {
    if (!job.target_number) {
      await db.from("outbound_jobs").update({ status: "failed", result: "Pas de numéro cible" }).eq("id", job.id);
      continue;
    }
    const { data: profile } = await db.from("profiles").select("full_name").eq("id", job.user_id).single();
    const assistantJob: OutboundJob = {
      id: job.id,
      kind: job.kind,
      goal: job.goal,
      target_name: job.target_name,
      target_number: job.target_number,
      constraints: job.constraints ?? {},
      callback_number: job.callback_number,
      user_full_name: profile?.full_name ?? null,
    };
    try {
      let callId: string;
      if (envOr("RUNTIME", "selfhost") === "selfhost") {
        // Runtime auto-hébergé (Pipecat) : c'est lui qui compose l'appel.
        const res = await fetch(`${env("RUNTIME_URL")}/outbound`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${env("RUNTIME_API_SECRET")}`,
          },
          body: JSON.stringify({ job_id: job.id, to_number: job.target_number }),
        });
        if (!res.ok) throw new Error(`runtime /outbound -> ${res.status} ${await res.text()}`);
        callId = ((await res.json()) as { call_id: string }).call_id;
      } else {
        const call = await startOutboundCall({
          toNumber: job.target_number,
          assistant: buildOutboundAssistant(assistantJob),
          metadata: { outbound_job_id: job.id },
        });
        callId = call.id;
      }
      await db
        .from("outbound_jobs")
        .update({
          status: "calling",
          attempts: job.attempts + 1,
          vapi_call_id: callId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      await db.from("call_logs").upsert(
        {
          user_id: job.user_id,
          direction: "outbound",
          vapi_call_id: callId,
          agent: job.kind,
          to_number: job.target_number,
        },
        { onConflict: "vapi_call_id" },
      );
      launched++;
    } catch (err) {
      console.error("appel sortant", job.id, err);
      await db
        .from("outbound_jobs")
        .update({ attempts: job.attempts + 1, updated_at: new Date().toISOString() })
        .eq("id", job.id);
    }
  }
  return NextResponse.json({ launched, pending: jobs?.length ?? 0 });
}
