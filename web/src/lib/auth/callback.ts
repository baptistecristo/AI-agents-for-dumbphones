// Retour d'authentification, partagé par /auth/callback et /auth/confirm.
//
// Supabase peut renvoyer l'utilisateur de DEUX façons selon la méthode :
//   1. Flux PKCE — ?code=…  (connexion OAuth Google/Apple/Microsoft/GitHub, et
//      lien magique quand le gabarit e-mail garde le ConfirmationURL par défaut).
//      On l'échange contre une session avec exchangeCodeForSession. Le
//      code_verifier a été posé en cookie par le navigateur au départ ; c'est
//      pour ça que l'échange doit se faire ici, côté serveur, où le cookie existe.
//   2. Flux token_hash — ?token_hash=&type=  (gabarit e-mail personnalisé qui
//      pointe directement sur notre route). On le vérifie avec verifyOtp.
//
// L'ancienne route ne gérait QUE le token_hash, si bien qu'un lien PKCE (le cas
// par défaut) atterrissait sans jamais ouvrir de session. Les deux formes sont
// désormais couvertes, plus l'erreur explicite renvoyée par un fournisseur.

import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { safeNext } from "./next";

export async function handleAuthCallback(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const params = url.searchParams;
  const next = safeNext(params.get("next"));
  const fail = () => NextResponse.redirect(new URL("/connexion?erreur=lien", url.origin));

  // Le fournisseur (OAuth annulé, lien invalide côté Supabase…) a répondu par
  // une erreur : inutile de tenter un échange, on renvoie au formulaire.
  if (params.get("error") || params.get("error_code")) return fail();

  const supabase = await supabaseServer();

  const code = params.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return error ? fail() : NextResponse.redirect(new URL(next, url.origin));
  }

  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }

  return fail();
}
