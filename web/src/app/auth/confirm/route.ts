// Confirmation du lien magique (e-mail) : vérifie le token puis redirige.

import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const rawNext = url.searchParams.get("next") ?? "/onboarding";
  // Anti open-redirect : uniquement un chemin relatif interne.
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//") && !rawNext.startsWith("/\\")
      ? rawNext
      : "/onboarding";

  if (tokenHash && type) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL("/connexion?erreur=lien", url.origin));
}
