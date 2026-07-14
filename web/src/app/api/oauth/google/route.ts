// Démarre la connexion Google (OAuth). L'utilisateur doit être connecté au site.

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { APP_URL } from "@/lib/env";
import { googleAuthUrl } from "@/lib/google";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/connexion", APP_URL()));

  const state = randomBytes(16).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set("google_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax", // renvoyé au retour de redirection Google (cross-site GET)
    maxAge: 600,
    path: "/",
  });
  return NextResponse.redirect(googleAuthUrl(state));
}
