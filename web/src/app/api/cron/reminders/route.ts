// Cron (toutes les minutes) : envoie les rappels arrivés à échéance par SMS
// et reprogramme les récurrents.

import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { envOr } from "@/lib/env";
import { normalizeLanguage } from "@/lib/language";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendSms } from "@/lib/twilio";

export const maxDuration = 60;

function nextOccurrence(dueAt: string, recurrence: string): string {
  const d = new Date(dueAt);
  if (recurrence === "daily") d.setDate(d.getDate() + 1);
  else if (recurrence === "weekly") d.setDate(d.getDate() + 7);
  else if (recurrence === "monthly") d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

export async function GET(req: Request) {
  const secret = envOr("CRON_SECRET", "");
  if (!secret || !safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ error: "non autorisé" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const { data: due } = await db
    .from("reminders")
    .select("id, user_id, text, due_at, recurrence")
    .eq("status", "pending")
    .lte("due_at", new Date().toISOString())
    .limit(25);

  let sent = 0;
  for (const r of due ?? []) {
    const { data: phone } = await db
      .from("phones")
      .select("e164")
      .eq("user_id", r.user_id)
      .not("verified_at", "is", null)
      .limit(1)
      .maybeSingle();
    if (phone) {
      try {
        const { data: profile } = await db
          .from("profiles")
          .select("preferred_language")
          .eq("id", r.user_id)
          .maybeSingle();
        const body =
          normalizeLanguage(profile?.preferred_language) === "en"
            ? `🔔 Reminder: ${r.text}`
            : `🔔 Rappel : ${r.text}`;
        await sendSms({ to: phone.e164, body, userId: r.user_id, kind: "reminder" });
        sent++;
      } catch (err) {
        console.error("rappel SMS", r.id, err);
        continue; // on retentera au prochain passage
      }
    }
    await db.from("reminders").update({ status: "sent" }).eq("id", r.id);
    if (r.recurrence && r.due_at) {
      await db.from("reminders").insert({
        user_id: r.user_id,
        text: r.text,
        due_at: nextOccurrence(r.due_at, r.recurrence),
        recurrence: r.recurrence,
      });
    }
  }
  return NextResponse.json({ sent, checked: due?.length ?? 0 });
}
