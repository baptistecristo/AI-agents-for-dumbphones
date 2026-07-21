import { describe, expect, it } from "vitest";
import {
  isOnboardingComplete,
  shouldEnterOnboarding,
  shouldLeaveOnboarding,
} from "./onboarding";

// Tous les états qu'une ligne profiles peut porter, plus les deux façons de ne
// pas en avoir. `null`/`undefined` = pas de ligne du tout : la colonne est
// `not null default 'phone'` depuis 0001_init, un profil existant a toujours
// une étape.
const STATES: (string | null | undefined)[] = [
  "phone",
  "google",
  "consents",
  "done",
  "pin",
  "inconnu",
  null,
  undefined,
];

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
});

describe("les deux gardes", () => {
  // Ce que chaque garde doit répondre, état par état. C'est la table qui tient
  // le contrat : changer une garde sans changer l'autre casse une ligne ici.
  const EXPECTED: [string | null | undefined, boolean, boolean][] = [
    // état, /onboarding s'en va ?, le tableau de bord renvoie ?
    ["phone", false, true],
    ["google", false, true],
    ["consents", false, true],
    ["done", true, false],
    ["pin", true, false],
    ["inconnu", false, true],
    [null, false, true],
    [undefined, false, true],
  ];

  it.each(EXPECTED)("%s : quitte=%s, entre=%s", (step, leave, enter) => {
    expect(shouldLeaveOnboarding(step)).toBe(leave);
    expect(shouldEnterOnboarding(step)).toBe(enter);
  });

  it("traite un compte sans ligne profiles comme un onboarding à faire", () => {
    // Le tableau de bord laissait entrer ce compte (`profile?.onboarding_step &&`
    // était faux, donc pas de redirection) alors que /onboarding le gardait.
    // Il n'a ni nom, ni téléphone, ni consentements : il n'a rien fini.
    expect(shouldEnterOnboarding(undefined)).toBe(true);
    expect(shouldEnterOnboarding(null)).toBe(true);
  });

  it("interdit la boucle : la navigation réelle s'arrête toujours", () => {
    // On rejoue le va-et-vient que les deux pages produisent. /onboarding
    // renvoie vers /tableau-de-bord quand la garde le dit ; la coque du tableau
    // de bord renvoie vers /onboarding quand la sienne le dit. Si un état
    // satisfait les deux, on tourne, et le compteur de sauts lève.
    const settle = (start: string, step: string | null | undefined) => {
      let page = start;
      for (let hop = 0; hop <= 4; hop++) {
        const next =
          page === "/onboarding"
            ? shouldLeaveOnboarding(step)
              ? "/tableau-de-bord"
              : null
            : shouldEnterOnboarding(step)
              ? "/onboarding"
              : null;
        if (next === null) return page;
        page = next;
      }
      throw new Error(`boucle de redirection sur onboarding_step=${String(step)}`);
    };

    for (const step of STATES) {
      // Depuis l'une ou l'autre porte, on finit sur la même page : celle qui
      // correspond à l'avancement. Un seul état ne peut pas être à la fois
      // « fini » pour une garde et « en cours » pour l'autre.
      const landing = isOnboardingComplete(step) ? "/tableau-de-bord" : "/onboarding";
      expect(settle("/onboarding", step)).toBe(landing);
      expect(settle("/tableau-de-bord", step)).toBe(landing);
    }
  });
});
