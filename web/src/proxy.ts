// Proxy (ex-middleware) : rafraîchit la session Supabase et aiguille selon
// l'état de connexion. Next 16 : ce fichier remplace middleware.ts.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { routeGuard } from "@/lib/auth/route-guard";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const action = routeGuard(request.nextUrl.pathname, Boolean(user));
  if (action) {
    // Une redirection est une réponse NEUVE : sans y recopier les cookies que
    // getUser() vient peut-être de rafraîchir (posés sur `response` par setAll),
    // on renverrait une session périmée et l'utilisateur rebondirait. On les
    // reporte donc sur chaque redirection.
    const redirect = NextResponse.redirect(new URL(action.redirect, request.url));
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  return response;
}

export const config = {
  matcher: ["/tableau-de-bord/:path*", "/onboarding/:path*", "/connexion"],
};
