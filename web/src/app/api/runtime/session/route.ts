// Runtime self-host -> ouverture de session d'appel.
// Le runtime (Pipecat) envoie le numéro appelant et l'id d'appel opérateur ;
// on renvoie le prompt système personnalisé + le message d'accueil, et on
// crée la ligne de journal qui servira de session (PIN, user) aux outils.

import { NextResponse } from "next/server";
import { agentName, inboundSystemPrompt } from "@/lib/agents/inbound";
import { outboundSystemPrompt } from "@/lib/agents/outbound";
import { safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/admin";

function authorized(req: Request): boolean {
  return safeEqual(req.headers.get("authorization") ?? "", `Bearer ${env("RUNTIME_API_SECRET")}`);
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "non autorisé" }, { status: 401 });
  const body = (await req.json()) as {
    provider_call_id: string;
    direction: "inbound" | "outbound";
    caller_number?: string;
    job_id?: string;
  };
  const db = supabaseAdmin();

  // ---------------------------------------------------------- appel sortant
  if (body.direction === "outbound") {
    if (!body.job_id) return NextResponse.json({ error: "job_id requis" }, { status: 400 });
    const { data: job } = await db.from("outbound_jobs").select("*").eq("id", body.job_id).single();
    if (!job) return NextResponse.json({ error: "job introuvable" }, { status: 404 });
    const { data: profile } = await db.from("profiles").select("full_name").eq("id", job.user_id).single();

    await db.from("call_logs").upsert(
      {
        vapi_call_id: body.provider_call_id,
        user_id: job.user_id,
        direction: "outbound",
        agent: job.kind,
        to_number: job.target_number,
      },
      { onConflict: "vapi_call_id" },
    );

    return NextResponse.json({
      call_id: body.provider_call_id,
      system_prompt: outboundSystemPrompt({
        id: job.id,
        kind: job.kind,
        goal: job.goal,
        target_name: job.target_name,
        target_number: job.target_number,
        constraints: job.constraints ?? {},
        callback_number: job.callback_number,
        user_full_name: profile?.full_name ?? null,
      }),
      first_message: null, // sortant : on attend que l'interlocuteur décroche et parle
      job_id: job.id,
    });
  }

  // ---------------------------------------------------------- appel entrant
  const caller = body.caller_number ?? null;
  let ctx = {
    userId: null as string | null,
    preferredName: null as string | null,
    homeAddress: null as string | null,
    memories: [] as { key: string; value: string }[],
    pinConfigured: false,
  };
  if (caller) {
    const { data: phone } = await db
      .from("phones")
      .select("user_id")
      .eq("e164", caller)
      .not("verified_at", "is", null)
      .maybeSingle();
    if (phone) {
      const [{ data: profile }, { data: memories }] = await Promise.all([
        db.from("profiles").select("full_name, preferred_name, home_address, pin_hash").eq("id", phone.user_id).single(),
        db.from("memories").select("key, value").eq("user_id", phone.user_id).limit(30),
      ]);
      ctx = {
        userId: phone.user_id,
        preferredName: profile?.preferred_name || profile?.full_name || null,
        homeAddress: profile?.home_address ?? null,
        memories: memories ?? [],
        pinConfigured: Boolean(profile?.pin_hash),
      };
    }
  }

  await db.from("call_logs").upsert(
    {
      vapi_call_id: body.provider_call_id,
      user_id: ctx.userId,
      direction: "inbound",
      agent: "assistant",
      from_number: caller,
    },
    { onConflict: "vapi_call_id" },
  );

  const name = agentName();
  return NextResponse.json({
    call_id: body.provider_call_id,
    system_prompt: inboundSystemPrompt(ctx),
    first_message: ctx.preferredName
      ? `Bonjour ${ctx.preferredName} ! Ici ${name}. Que puis-je faire pour vous ?`
      : `Bonjour ! Ici ${name}, votre assistant. Que puis-je faire pour vous ?`,
  });
}
