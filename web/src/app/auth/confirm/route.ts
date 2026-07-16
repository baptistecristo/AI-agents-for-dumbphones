// Confirmation du lien magique (e-mail). Conservée pour les liens déjà envoyés
// et les gabarits en token_hash ; elle partage la logique de /auth/callback, qui
// gère aussi le ?code= du flux PKCE (l'ancienne version ne voyait que token_hash).

import { handleAuthCallback } from "@/lib/auth/callback";

export function GET(req: Request) {
  return handleAuthCallback(req);
}
