// Fournisseurs de connexion OAuth affichés sur le formulaire.
//
// Deux listes, pilotées par l'environnement (valeurs : google, apple, microsoft
// [= azure/outlook], github) :
//   • NEXT_PUBLIC_AUTH_PROVIDERS      — fournisseurs RÉELLEMENT activés dans
//     Supabase. Leur bouton lance la connexion. Défaut : aucun. Tant qu'un
//     fournisseur n'est pas activé côté Supabase, son bouton ne doit pas tenter
//     de connexion (« provider not enabled »).
//   • NEXT_PUBLIC_AUTH_PROVIDERS_SOON — fournisseurs affichés en « bientôt » :
//     bouton visible mais grisé, qui renvoie vers une page d'attente. Défaut :
//     les quatre. On déplace un fournisseur de SOON vers PROVIDERS le jour où on
//     l'active (app OAuth créée, secret collé dans Supabase).
//
// Un fournisseur « live » l'emporte sur « soon ». Le lien magique et le code
// e-mail à 6 chiffres ne dépendent d'aucun fournisseur et restent toujours là.

import type { Provider } from "@supabase/supabase-js";

export type OAuthId = "google" | "apple" | "azure" | "github";
export type ProviderStatus = "live" | "soon";

const ORDER: OAuthId[] = ["google", "apple", "azure", "github"];

// « microsoft » et « outlook » sont des alias parlants pour le fournisseur azure.
const ALIASES: Record<string, OAuthId> = {
  google: "google",
  apple: "apple",
  azure: "azure",
  microsoft: "azure",
  outlook: "azure",
  github: "github",
};

export const PROVIDERS: Record<
  OAuthId,
  { label: string; name: string; provider: Provider; Icon: () => React.ReactElement }
> = {
  google: { label: "Continuer avec Google", name: "Google", provider: "google", Icon: GoogleIcon },
  apple: { label: "Continuer avec Apple", name: "Apple", provider: "apple", Icon: AppleIcon },
  azure: { label: "Continuer avec Microsoft", name: "Microsoft", provider: "azure", Icon: MicrosoftIcon },
  github: { label: "Continuer avec GitHub", name: "GitHub", provider: "github", Icon: GitHubIcon },
};

function parseList(raw: string | undefined, fallback: OAuthId[]): OAuthId[] {
  if (raw === undefined) return fallback;
  const wanted = new Set<OAuthId>();
  for (const token of raw.split(",")) {
    const id = ALIASES[token.trim().toLowerCase()];
    if (id) wanted.add(id);
  }
  return ORDER.filter((id) => wanted.has(id));
}

export function displayedProviders(): { id: OAuthId; status: ProviderStatus }[] {
  const live = parseList(process.env.NEXT_PUBLIC_AUTH_PROVIDERS, []);
  const soon = parseList(process.env.NEXT_PUBLIC_AUTH_PROVIDERS_SOON, ORDER);
  return ORDER.filter((id) => live.includes(id) || soon.includes(id)).map(
    (id): { id: OAuthId; status: ProviderStatus } => ({
      id,
      status: live.includes(id) ? "live" : "soon",
    }),
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" className="h-5 w-5">
      <path d="M16.365 1.43c0 1.14-.42 2.2-1.12 2.98-.75.85-1.98 1.5-3.02 1.42-.13-1.09.44-2.24 1.09-2.96.73-.82 2.02-1.42 3.05-1.44zM20.5 17.06c-.55 1.27-.82 1.84-1.53 2.96-.99 1.57-2.39 3.52-4.12 3.53-1.54.02-1.94-1.01-4.03-1-2.09.01-2.53 1.02-4.07 1.01-1.73-.02-3.06-1.78-4.05-3.35C.87 16.36.44 12.13 1.86 9.5c.99-1.86 2.56-2.94 4.03-2.94 1.5 0 2.44.99 3.68.99 1.2 0 1.93-.99 3.67-.99 1.3 0 2.68.71 3.66 1.93-3.21 1.76-2.69 6.35.9 7.57z" />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path fill="#F25022" d="M1 1h10v10H1z" />
      <path fill="#7FBA00" d="M13 1h10v10H13z" />
      <path fill="#00A4EF" d="M1 13h10v10H1z" />
      <path fill="#FFB900" d="M13 13h10v10H13z" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" className="h-5 w-5">
      <path d="M12 .5C5.37.5 0 5.87 0 12.5c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58v-2.02c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.21.09 1.84 1.24 1.84 1.24 1.07 1.84 2.81 1.31 3.5 1 .11-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.17 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 016 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.65.25 2.87.12 3.17.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.62-5.49 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.83.58C20.56 22.29 24 17.8 24 12.5 24 5.87 18.63.5 12 .5z" />
    </svg>
  );
}
