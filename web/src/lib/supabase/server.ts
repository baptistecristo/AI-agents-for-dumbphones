// Client Supabase lié à la session de l'utilisateur (cookies), pour les
// Server Components et Server Actions. Respecte la RLS.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "../env";

export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // setAll appelé depuis un Server Component : ignorable si le proxy
          // rafraîchit les sessions.
        }
      },
    },
  });
}
