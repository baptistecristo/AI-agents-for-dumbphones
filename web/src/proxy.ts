// Proxy (ex-middleware) : rafraîchit la session Supabase et protège les pages
// privées. Next 16 : ce fichier remplace middleware.ts.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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

  const isPrivate =
    request.nextUrl.pathname.startsWith("/tableau-de-bord") ||
    request.nextUrl.pathname.startsWith("/onboarding");
  if (!user && isPrivate) {
    return NextResponse.redirect(new URL("/connexion", request.url));
  }
  return response;
}

export const config = {
  matcher: ["/tableau-de-bord/:path*", "/onboarding/:path*", "/connexion"],
};
