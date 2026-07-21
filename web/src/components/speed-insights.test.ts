import { describe, expect, it } from "vitest";
import { isPublic } from "./speed-insights";

describe("isPublic", () => {
  it("measures the pages a visitor reaches without an account", () => {
    for (const path of ["/", "/telephones", "/connexion", "/connexion/bientot"]) {
      expect(isPublic(path)).toBe(true);
    }
  });

  // The point of the allow-list. If someone routes a new signed-in page and
  // forgets this file, it gets no beacon, which is the harmless direction.
  it("stays off every signed-in page", () => {
    const signedIn = [
      "/onboarding",
      "/tableau-de-bord",
      "/tableau-de-bord/agent",
      "/tableau-de-bord/autorisations",
      "/tableau-de-bord/compte",
      "/tableau-de-bord/memoire",
      "/tableau-de-bord/quelque-chose-qui-nexiste-pas-encore",
    ];
    for (const path of signedIn) {
      expect(isPublic(path)).toBe(false);
    }
  });

  // "/" is the landing page, not a prefix. Without the special case, every
  // route on the site would start with it and the allow-list would mean nothing.
  it("does not let the landing page swallow the whole site", () => {
    expect(isPublic("/tableau-de-bord")).toBe(false);
    expect(isPublic("/")).toBe(true);
  });

  // A path that merely starts with the same letters is a different route.
  it("matches whole segments rather than string prefixes", () => {
    expect(isPublic("/telephones")).toBe(true);
    expect(isPublic("/telephones/nokia-6300-4g")).toBe(true);
    expect(isPublic("/telephones-prives")).toBe(false);
  });
});
