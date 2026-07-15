// Runtime self-host -> ouverture de session d'appel.
// Le runtime (Pipecat) envoie le numéro appelant et l'id d'appel opérateur ;
// on renvoie le prompt système personnalisé + le message d'accueil + la langue
// de l'appel, et on crée la ligne de journal qui servira de session (auth,
// user, langue) aux outils.

import { NextResponse } from "next/server";
import { inboundFirstMessage, inboundSystemPrompt } from "@/lib/agents/inbound";
import { outboundSystemPrompt } from "@/lib/agents/outbound";
import { safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { defaultLanguage, normalizeLanguage } from "@/lib/language";
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
    const { data: profile } = await db
      .from("profiles")
      .select("full_name, preferred_language")
      .eq("id", job.user_id)
      .single();
    const language = normalizeLanguage(profile?.preferred_language);

    await db.from("call_logs").upsert(
      {
        vapi_call_id: body.provider_call_id,
        user_id: job.user_id,
        direction: "outbound",
        agent: job.kind,
        to_number: job.target_number,
        language,
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
        user_language: language,
      }),
      first_message: null, // sortant : on attend que l'interlocuteur décroche et parle
      language,
      job_id: job.id,
    });
  }

  // ---------------------------------------------------------- appel entrant
  // Le caller-ID identifie la personne mais ne débloque rien : aucune PII (adresse,
  // mémoires) dans le prompt. Les données se lisent via des outils après le code.
  const caller = body.caller_number ?? null;
  let ctx = {
    userId: null as string | null,
    preferredName: null as string | null,
    language: defaultLanguage(), // appelant inconnu -> env DEFAULT_LANGUAGE
  };
  if (caller) {
    const { data: phone } = await db
      .from("phones")
      .select("user_id")
      .eq("e164", caller)
      .not("verified_at", "is", null)
      .maybeSingle();
    if (phone) {
      const { data: profile } = await db
        .from("profiles")
        .select("full_name, preferred_name, preferred_language")
        .eq("id", phone.user_id)
        .single();
      ctx = {
        userId: phone.user_id,
        preferredName: profile?.preferred_name || profile?.full_name || null,
        language: normalizeLanguage(profile?.preferred_language),
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
      language: ctx.language,
    },
    { onConflict: "vapi_call_id" },
  );

  return NextResponse.json({
    call_id: body.provider_call_id,
    system_prompt: inboundSystemPrompt(ctx),
    first_message: inboundFirstMessage(ctx),
    language: ctx.language,
  });
}
