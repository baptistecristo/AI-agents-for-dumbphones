import { describe, expect, it } from "vitest";
import { routeGuard } from "./route-guard";

describe("routeGuard", () => {
  it("renvoie l'utilisateur connecté hors de /connexion vers son espace", () => {
    expect(routeGuard("/connexion", true)).toEqual({ redirect: "/onboarding" });
  });

  it("laisse le visiteur anonyme voir /connexion", () => {
    expect(routeGuard("/connexion", false)).toBeNull();
  });

  it("protège les pages privées quand il n'y a pas de session", () => {
    expect(routeGuard("/tableau-de-bord", false)).toEqual({ redirect: "/connexion" });
    expect(routeGuard("/tableau-de-bord/compte", false)).toEqual({ redirect: "/connexion" });
    expect(routeGuard("/onboarding", false)).toEqual({ redirect: "/connexion" });
  });

  it("laisse passer l'utilisateur connecté sur une page privée", () => {
    expect(routeGuard("/tableau-de-bord", true)).toBeNull();
    expect(routeGuard("/onboarding", true)).toBeNull();
  });

  it("ne touche pas les sous-pages publiques de connexion (ex. /connexion/bientot)", () => {
    // Le proxy ne matche que /connexion exactement, mais la garde doit rester
    // inoffensive si elle est appelée sur une sous-page : pas de redirection.
    expect(routeGuard("/connexion/bientot", true)).toBeNull();
    expect(routeGuard("/connexion/bientot", false)).toBeNull();
  });
});
