// Export des données personnelles (RGPD, droit d'accès et de portabilité).
// GET → un fichier JSON téléchargé, avec tout ce que l'agent garde de la
// personne. Deux règles tiennent tout le fichier :
//   1. l'accès est lié à la session (supabaseServer) ; sans session, 401 ;
//   2. rien de chiffré ni de secret ne sort — ni le refresh_token_enc de Google,
//      ni le pin_hash du profil. Ces valeurs servent à l'agent, elles ne se
//      relisent pas.
// Chaque requête est portée par la service_role (supabaseAdmin), donc SCOPÉE à
// user.id sur chaque table : jamais la ligne d'un autre compte.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "non autorisé" }, { status: 401 });

  const db = supabaseAdmin();
  const uid = user.id;

  const [
    profile,
    phones,
    consents,
    reminders,
    memories,
    callLogs,
    smsLogs,
    outboundJobs,
    importantSenders,
    googleConnection,
  ] = await Promise.all([
    db.from("profiles").select("*").eq("id", uid).maybeSingle(),
    db.from("phones").select("*").eq("user_id", uid),
    db.from("consents").select("*").eq("user_id", uid),
    db.from("reminders").select("*").eq("user_id", uid),
    db.from("memories").select("*").eq("user_id", uid),
    db.from("call_logs").select("*").eq("user_id", uid),
    db.from("sms_logs").select("*").eq("user_id", uid),
    db.from("outbound_jobs").select("*").eq("user_id", uid),
    db.from("important_senders").select("*").eq("user_id", uid),
    // Google : on ne SÉLECTIONNE que le sûr. refresh_token_enc n'est jamais lu.
    db.from("google_connections").select("google_email, scopes, connected_at").eq("user_id", uid).maybeSingle(),
  ]);

  // Le profil part en entier, sauf le pin_hash : c'est l'empreinte du code parlé,
  // un secret, pas une donnée à rendre. On le retire de la copie renvoyée.
  const rawProfile = (profile.data ?? null) as Record<string, unknown> | null;
  const profiles = rawProfile
    ? Object.fromEntries(Object.entries(rawProfile).filter(([key]) => key !== "pin_hash"))
    : null;

  const data = {
    profiles,
    phones: phones.data ?? [],
    consents: consents.data ?? [],
    reminders: reminders.data ?? [],
    memories: memories.data ?? [],
    call_logs: callLogs.data ?? [],
    sms_logs: smsLogs.data ?? [],
    outbound_jobs: outboundJobs.data ?? [],
    important_senders: importantSenders.data ?? [],
    google_connections: googleConnection.data ?? null,
  };

  return NextResponse.json(
    { exported_at: new Date().toISOString(), user_id: uid, data },
    {
      headers: {
        "Content-Disposition": 'attachment; filename="mes-donnees.json"',
        "Cache-Control": "no-store",
      },
    },
  );
}
