import { describe, expect, it } from "vitest";
import { authHandoff } from "./handoff";

// Un vrai code PKCE, dans la forme que Supabase émet : @supabase/auth-js
// documente exchangeCodeForSession sur cet UUID-là.
const CODE = "34e770dd-9ff9-416c-87fa-43b31d7ef225";

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
    expect(authHandoff({ code: CODE })).toBe(
      `/auth/callback?code=${CODE}&next=%2Fonboarding`,
    );
  });

  it("laisse la vitrine à un ?code= qui n'est pas un code PKCE", () => {
    // `code` sert à tout le monde : promo, parrainage, affiliation. Sans
    // contrôle de forme, /?code=SUMMER25 filait vers /auth/callback, l'échange
    // échouait, et le visiteur finissait sur /connexion?erreur=lien.
    expect(authHandoff({ code: "SUMMER25" })).toBeNull();
    expect(authHandoff({ code: "PARRAIN" })).toBeNull();
    expect(authHandoff({ code: "12345" })).toBeNull();
    // Presque un UUID, mais pas un : un groupe trop court, un caractère hors
    // hexadécimal, des tirets en moins.
    expect(authHandoff({ code: "34e770dd-9ff9-416c-87fa-43b31d7ef22" })).toBeNull();
    expect(authHandoff({ code: "34e770dd-9ff9-416c-87fa-43b31d7ef22z" })).toBeNull();
    expect(authHandoff({ code: "34e770dd9ff9416c87fa43b31d7ef225" })).toBeNull();
  });

  it("accepte le code quelle que soit la casse ou la version de l'UUID", () => {
    const majuscules = CODE.toUpperCase();
    expect(authHandoff({ code: majuscules })).toBe(
      `/auth/callback?code=${majuscules}&next=%2Fonboarding`,
    );
  });

  it("ne reporte pas un code douteux qui accompagne un vrai justificatif", () => {
    // /auth/callback essaie le `code` AVANT le token_hash : reporter un code
    // promo ferait échouer un lien e-mail parfaitement valide.
    expect(authHandoff({ token_hash: "xyz", type: "magiclink", code: "SUMMER25" })).toBe(
      "/auth/callback?token_hash=xyz&type=magiclink&next=%2Fonboarding",
    );
  });

  it("ne se laisse pas déclencher par un paramètre répété", () => {
    // Next rend `?code=a&code=b` sous forme de tableau. Supabase ne répète
    // jamais un paramètre : la valeur n'est pas crédible, et en choisir une
    // serait une devinette qu'un lien forgé pourrait orienter.
    expect(authHandoff({ code: [CODE, CODE] })).toBeNull();
    expect(authHandoff({ code: ["SUMMER25", CODE] })).toBeNull();
    expect(authHandoff({ token_hash: ["xyz", "abc"], type: "magiclink" })).toBeNull();
  });

  it("laisse tomber un accompagnement répété sans perdre le déclencheur", () => {
    expect(authHandoff({ token_hash: "xyz", type: ["magiclink", "recovery"] })).toBe(
      "/auth/callback?token_hash=xyz&next=%2Fonboarding",
    );
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
    expect(authHandoff({ code: CODE, next: "/tableau-de-bord" })).toBe(
      `/auth/callback?code=${CODE}&next=%2Ftableau-de-bord`,
    );
  });

  it("laisse safeNext arbitrer : le next douteux est transmis, jamais interprété ici", () => {
    // On ne duplique pas l'anti-open-redirect ; /auth/callback le fait déjà.
    // Ce qui compte, c'est que la valeur parte encodée, sans casser l'URL.
    expect(authHandoff({ code: CODE, next: "https://evil.example" })).toBe(
      `/auth/callback?code=${CODE}&next=https%3A%2F%2Fevil.example`,
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
