// Connexion Google par utilisateur (OAuth 2.0, scopes minimaux) :
// Calendar (agenda) + People (contacts). Gmail viendra en phase 1
// (scopes "restricted" -> vérification CASA, voir §5 du doc d'archi).

import { google } from "googleapis";
import { decrypt, encrypt } from "./crypto";
import { env, APP_URL } from "./env";
import { supabaseAdmin } from "./supabase/admin";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/contacts.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

export function oauthClient() {
  return new google.auth.OAuth2(
    env("GOOGLE_CLIENT_ID"),
    env("GOOGLE_CLIENT_SECRET"),
    `${APP_URL()}/api/oauth/google/callback`,
  );
}

export function googleAuthUrl(state: string): string {
  return oauthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // force le refresh_token à chaque connexion
    scope: GOOGLE_SCOPES,
    state,
  });
}

export async function saveGoogleConnection(userId: string, code: string): Promise<string> {
  const oauth = oauthClient();
  const { tokens } = await oauth.getToken(code);
  if (!tokens.refresh_token) throw new Error("Google n'a pas renvoyé de refresh_token");
  oauth.setCredentials(tokens);
  const me = await google.oauth2({ version: "v2", auth: oauth }).userinfo.get();
  const email = me.data.email ?? "inconnu";
  await supabaseAdmin().from("google_connections").upsert({
    user_id: userId,
    google_email: email,
    refresh_token_enc: encrypt(tokens.refresh_token),
    scopes: GOOGLE_SCOPES,
    connected_at: new Date().toISOString(),
  });
  return email;
}

// Client authentifié pour un utilisateur donné (utilisé par les skills)
export async function googleFor(userId: string) {
  const { data, error } = await supabaseAdmin()
    .from("google_connections")
    .select("refresh_token_enc")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  const oauth = oauthClient();
  oauth.setCredentials({ refresh_token: decrypt(data.refresh_token_enc) });
  return oauth;
}
