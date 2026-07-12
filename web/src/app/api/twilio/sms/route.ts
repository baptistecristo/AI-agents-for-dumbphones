// SMS entrants (webhook Twilio) : routeur de commandes façon Sift
// (METEO, AGENDA, RAPPEL, ROUTE…) — voir src/lib/sms-commands.ts.

import { NextResponse } from "next/server";
import twilio from "twilio";
import { envOr } from "@/lib/env";
import { handleSmsCommand } from "@/lib/sms-commands";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const form = await req.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => {
    params[k] = String(v);
  });

  // Authenticité Twilio (signature X-Twilio-Signature)
  const signature = req.headers.get("x-twilio-signature") ?? "";
  const url = `${envOr("APP_URL", "http://localhost:3000")}/api/twilio/sms`;
  const valid = twilio.validateRequest(envOr("TWILIO_AUTH_TOKEN", ""), signature, url, params);
  if (!valid && process.env.NODE_ENV === "production") {
    return new NextResponse("signature invalide", { status: 401 });
  }

  const from = params.From;
  const body = params.Body ?? "";

  const db = supabaseAdmin();
  const { data: phone } = await db
    .from("phones")
    .select("user_id")
    .eq("e164", from)
    .maybeSingle();
  await db.from("sms_logs").insert({
    user_id: phone?.user_id ?? null,
    direction: "inbound",
    e164: from,
    body,
  });

  const reply = await handleSmsCommand(
    { callId: "sms", userId: phone?.user_id ?? null, callerNumber: from, pinVerified: false },
    body,
  );

  const escaped = reply.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`;
  return new NextResponse(twiml, { headers: { "Content-Type": "text/xml" } });
}
