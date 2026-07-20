// Web Vitals, but only on the pages anyone can reach without signing in.
//
// Speed Insights beacons a sample per page view to Vercel, in the US. The
// README sells this project as EU / privacy-first, so the signed-in area stays
// out of it: which reminders or memories someone opens in their own dashboard
// is not ours to hand a third party for a performance graph. The public pages
// carry no such expectation, and they are the ones whose load time decides
// whether a visitor stays.
//
// PUBLIC_ROUTES is an allow-list on purpose. A route added later measures
// nothing until someone lists it here, so the mistake this invites is a missing
// graph rather than an unannounced beacon.

"use client";

import { SpeedInsights } from "@vercel/speed-insights/next";
import { usePathname } from "next/navigation";

const PUBLIC_ROUTES = ["/", "/telephones", "/connexion"];

export function isPublic(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || (route !== "/" && pathname.startsWith(`${route}/`)),
  );
}

export function PublicSpeedInsights() {
  const pathname = usePathname();
  return isPublic(pathname) ? <SpeedInsights /> : null;
}
