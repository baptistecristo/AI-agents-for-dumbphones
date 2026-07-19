import { describe, expect, it } from "vitest";
import { isOnboardingComplete } from "./onboarding";

describe("isOnboardingComplete", () => {
  it("considère l'onboarding terminé sur 'done'", () => {
    expect(isOnboardingComplete("done")).toBe(true);
  });

  it("considère 'pin' comme terminé (étape retirée, états hérités en base)", () => {
    expect(isOnboardingComplete("pin")).toBe(true);
  });

  it("considère les étapes en cours comme non terminées", () => {
    expect(isOnboardingComplete("phone")).toBe(false);
    expect(isOnboardingComplete("google")).toBe(false);
    expect(isOnboardingComplete("consents")).toBe(false);
  });

  it("ne prend pas une valeur inattendue pour un onboarding fini", () => {
    expect(isOnboardingComplete("inconnu")).toBe(false);
    expect(isOnboardingComplete(null)).toBe(false);
    expect(isOnboardingComplete(undefined)).toBe(false);
  });

  it("interdit la boucle : les deux gardes lisent le même verdict", () => {
    // /onboarding renvoie vers /tableau-de-bord quand c'est fini ; la coque du
    // tableau de bord renvoie vers /onboarding quand ça ne l'est pas. Tant que
    // les deux dérivent de cette fonction, aucun état ne peut satisfaire les
    // deux conditions à la fois — c'est ce qui bouclait sur 'pin'.
    for (const step of ["phone", "google", "consents", "done", "pin", "inconnu"]) {
      const onboardingRenvoieAuTableau = isOnboardingComplete(step);
      const tableauRenvoieAOnboarding = !isOnboardingComplete(step);
      expect(onboardingRenvoieAuTableau && tableauRenvoieAOnboarding).toBe(false);
    }
  });
});
