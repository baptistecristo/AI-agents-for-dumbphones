// Retour d'authentification : OAuth (Google/Apple/Microsoft/GitHub) et lien
// magique PKCE atterrissent ici avec ?code=. Logique partagée dans lib/auth.

import { handleAuthCallback } from "@/lib/auth/callback";

export function GET(req: Request) {
  return handleAuthCallback(req);
}
