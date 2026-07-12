// Retour OAuth Google : échange le code, chiffre le refresh_token, journalise
// le consentement, puis renvoie vers l'onboarding.

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { APP_URL } from "@/lib/env";
import { saveGoogleConnection } from "@/lib/google";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get("google_oauth_state")?.value;
  cookieStore.delete("google_oauth_state");

  const back = (path: string) => NextResponse.redirect(new URL(path, APP_URL()));

  if (!code || !state || state !== expectedState) return back("/onboarding?erreur=google_state");

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return back("/connexion");

  try {
    const email = await saveGoogleConnection(user.id, code);
    // Trace de consentement : la connexion du compte vaut consentement explicite
    // pour l'agenda + contacts (scopes demandés), horodaté.
    await supabaseAdmin().from("consents").insert([
      { user_id: user.id, source: "calendar", granted: true, scope_note: `Connexion Google ${email} — agenda (lecture/écriture)` },
      { user_id: user.id, source: "contacts", granted: true, scope_note: `Connexion Google ${email} — contacts (lecture seule)` },
    ]);
    await supabaseAdmin().from("profiles").update({ onboarding_step: "consents" }).eq("id", user.id);
    return back("/onboarding?google=ok");
  } catch (err) {
    console.error("OAuth Google", err);
    return back("/onboarding?erreur=google");
  }
}
