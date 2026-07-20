// SMS entrants (webhook Twilio). Deux chemins vers les MÊMES skills que la voix :
//  - un mot-clé connu (METEO, AGENDA, RAPPEL…) -> routeur direct, sans LLM ;
//  - du langage naturel -> boucle d'agent (agents/loop.ts), le même cerveau que
//    la voix, en texte. Les écritures par SMS exigent le PIN du tableau de bord
//    (voir skills/gate.ts et text-pin.ts) ; les lectures, non.

import { NextResponse } from "next/server";
import twilio from "twilio";
import { CallerContext, inboundTextSystemPrompt } from "@/lib/agents/inbound";
import { runTextTurn, type TextTurn } from "@/lib/agents/loop";
import { APP_URL, envOr } from "@/lib/env";
import { Language, normalizeLanguage } from "@/lib/language";
import { CallSession, t } from "@/lib/skills/types";
import { handleSmsCommand, looksLikeKeywordCommand } from "@/lib/sms-commands";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { loadTextVerified } from "@/lib/text-pin";

export const maxDuration = 60;

// Historique récent du fil (avant d'y ajouter le message courant) : ce qui permet
// un échange en plusieurs SMS (proposer → « oui » → agir) sur un canal sans état.
// On garde les entrants et les réponses de conversation (kind='chat'), pas les
// SMS système (codes, rappels). On commence toujours par un tour « user » :
// l'API du modèle refuse un historique qui débute côté assistant.
async function recentHistory(userId: string): Promise<TextTurn[]> {
  const since = new Date(Date.now() - 30 * 60_000).toISOString();
  const { data } = await supabaseAdmin()
    .from("sms_logs")
    .select("direction, body, kind, created_at")
    .eq("user_id", userId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(12);

  const turns = (data ?? [])
    .filter((r) => r.direction === "inbound" || (r.direction === "outbound" && r.kind === "chat"))
    .filter((r) => typeof r.body === "string" && r.body.trim())
    .reverse()
    .map((r): TextTurn => ({ role: r.direction === "inbound" ? "user" : "assistant", content: r.body }))
    .slice(-8);

  while (turns.length > 0 && turns[0].role === "assistant") turns.shift();
  return turns;
}

export async function POST(req: Request) {
  const form = await req.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => {
    params[k] = String(v);
  });

  // Authenticité Twilio (signature X-Twilio-Signature)
  const signature = req.headers.get("x-twilio-signature") ?? "";
  const url = `${APP_URL()}/api/twilio/sms`;
  const valid = twilio.validateRequest(envOr("TWILIO_AUTH_TOKEN", ""), signature, url, params);
  if (!valid && process.env.NODE_ENV === "production") {
    return new NextResponse("signature invalide", { status: 401 });
  }

  const from = params.From;
  const body = params.Body ?? "";
  const db = supabaseAdmin();

  // Même règle que le webhook vocal : seul un numéro VÉRIFIÉ (OTP) identifie un
  // compte ; sinon, parcours non authentifié.
  const { data: phone } = await db
    .from("phones")
    .select("user_id")
    .eq("e164", from)
    .not("verified_at", "is", null)
    .maybeSingle();
  const userId: string | null = phone?.user_id ?? null;

  // Profil : langue + persona (prénom, consignes) en une lecture.
  let language: Language = "fr";
  // recapOffer : toujours false ici. C'est une phrase du message d'ACCUEIL, et
  // un fil de texte n'en a pas — on ne décroche pas, on écrit. Par texte, la
  // personne demande le résumé quand elle le veut, comme le reste.
  let ctx: CallerContext = { userId, preferredName: null, language, voiceSpeed: null, agentInstructions: null, recapOffer: false };
  if (userId) {
    const { data: profile } = await db
      .from("profiles")
      .select("preferred_language, preferred_name, full_name, agent_instructions")
      .eq("id", userId)
      .maybeSingle();
    language = normalizeLanguage(profile?.preferred_language);
    ctx = {
      userId,
      preferredName: profile?.preferred_name || profile?.full_name || null,
      language,
      voiceSpeed: null,
      agentInstructions: profile?.agent_instructions ?? null,
      recapOffer: false,
    };
  }

  const history = userId ? await recentHistory(userId) : [];
  await db.from("sms_logs").insert({ user_id: userId, direction: "inbound", e164: from, body });

  const verified = userId ? await loadTextVerified(userId, from) : false;
  const session: CallSession = { callId: "sms", channel: "text", userId, callerNumber: from, verified, language };

  let reply: string;
  if (looksLikeKeywordCommand(body)) {
    reply = await handleSmsCommand(session, body);
  } else {
    try {
      reply = await runTextTurn({ session, systemPrompt: inboundTextSystemPrompt(ctx), history, userText: body });
    } catch (err) {
      // Boucle LLM indisponible (clé Anthropic absente, API en panne…). On ne
      // laisse pas la personne sans réponse : on renvoie vers ce qui marche.
      console.error("Boucle texte", err);
      reply = t(session, {
        fr: "Je ne peux pas répondre à ça pour le moment. Envoie AIDE pour les commandes, ou appelle-moi 📞",
        en: "I can't answer that right now. Send HELP for commands, or call me 📞",
        es: "No puedo responder a eso ahora mismo. Envía AYUDA para los comandos, o llámame 📞",
      });
    }
  }

  // Journalise la réponse comme tour de conversation (kind='chat'), pour que le
  // prochain message dispose de l'historique.
  if (userId) {
    await db.from("sms_logs").insert({ user_id: userId, direction: "outbound", e164: from, body: reply, kind: "chat" });
  }

  const escaped = reply.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`;
  return new NextResponse(twiml, { headers: { "Content-Type": "text/xml" } });
}
