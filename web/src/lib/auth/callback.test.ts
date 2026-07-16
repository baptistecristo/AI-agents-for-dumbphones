import { describe, expect, it } from "vitest";
import { safeNext } from "./next";

describe("safeNext", () => {
  it("laisse passer un chemin interne", () => {
    expect(safeNext("/tableau-de-bord")).toBe("/tableau-de-bord");
    expect(safeNext("/onboarding")).toBe("/onboarding");
  });

  it("retombe sur /onboarding quand rien n'est fourni", () => {
    expect(safeNext(null)).toBe("/onboarding");
  });

  it("refuse une redirection externe", () => {
    expect(safeNext("https://evil.example/steal")).toBe("/onboarding");
    expect(safeNext("//evil.example")).toBe("/onboarding");
    expect(safeNext("/\\evil.example")).toBe("/onboarding");
  });
});
