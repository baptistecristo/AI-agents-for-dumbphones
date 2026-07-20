import { describe, expect, it } from "vitest";
import { authHandoff } from "./handoff";

describe("authHandoff", () => {
  it("ignore une visite normale de la racine", () => {
    expect(authHandoff({})).toBeNull();
    expect(authHandoff({ utm_source: "newsletter" })).toBeNull();
  });

  it("laisse passer un lien vitrine qui porte type ou error_description", () => {
    // Supabase n'envoie jamais `type` seul, toujours collé à un token_hash. Un
    // /?type=annual (tarif, campagne) est du trafic ordinaire : le réexpédier
    // enverrait le visiteur sur /connexion?erreur=lien sans qu'il ait rien
    // demandé. Le déclencheur, c'est le justificatif, pas son accompagnement.
    expect(authHandoff({ type: "annual" })).toBeNull();
    expect(authHandoff({ type: "magiclink", utm_source: "newsletter" })).toBeNull();
    expect(authHandoff({ error_description: "quelque chose" })).toBeNull();
  });

  it("rattrape le code PKCE tombé sur la racine", () => {
    expect(authHandoff({ code: "abc123" })).toBe("/auth/callback?code=abc123&next=%2Fonboarding");
  });

  it("rattrape l'erreur renvoyée par Supabase (lien expiré ou déjà utilisé)", () => {
    // Le cas observé le 19/07 : le lien magique pointait sur la racine, l'erreur
    // arrivait en query, et la page vitrine s'affichait comme si de rien n'était.
    expect(
      authHandoff({ error: "access_denied", error_code: "otp_expired" }),
    ).toBe("/auth/callback?error=access_denied&error_code=otp_expired&next=%2Fonboarding");
  });

  it("rattrape aussi un gabarit e-mail en token_hash, avec son type", () => {
    // verifyOtp, côté /auth/callback, exige les deux : le type doit voyager.
    expect(authHandoff({ token_hash: "xyz", type: "magiclink" })).toBe(
      "/auth/callback?token_hash=xyz&type=magiclink&next=%2Fonboarding",
    );
  });

  it("reporte le next demandé quand il y en a un", () => {
    expect(authHandoff({ code: "abc", next: "/tableau-de-bord" })).toBe(
      "/auth/callback?code=abc&next=%2Ftableau-de-bord",
    );
  });

  it("laisse safeNext arbitrer : le next douteux est transmis, jamais interprété ici", () => {
    // On ne duplique pas l'anti-open-redirect ; /auth/callback le fait déjà.
    // Ce qui compte, c'est que la valeur parte encodée, sans casser l'URL.
    expect(authHandoff({ code: "abc", next: "https://evil.example" })).toBe(
      "/auth/callback?code=abc&next=https%3A%2F%2Fevil.example",
    );
  });

  it("encode les valeurs plutôt que de les concaténer", () => {
    expect(
      authHandoff({
        error: "access_denied",
        error_description: "Email link is invalid or has expired",
      }),
    ).toBe(
      "/auth/callback?error=access_denied&error_description=Email+link+is+invalid+or+has+expired&next=%2Fonboarding",
    );
  });
});
