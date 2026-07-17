// normalizeLanguage est l'unique porte d'entrée des langues : la base n'a pas
// de contrainte sur profiles.preferred_language, c'est cette fonction qui
// décide ce qui existe. Ces tests tiennent la liste et le repli.

import { describe, expect, it } from "vitest";
import { normalizeLanguage } from "./language";

describe("normalizeLanguage", () => {
  it("accepte exactement fr, en et es", () => {
    expect(normalizeLanguage("fr")).toBe("fr");
    expect(normalizeLanguage("en")).toBe("en");
    expect(normalizeLanguage("es")).toBe("es");
  });

  it("fait retomber tout le reste sur fr", () => {
    for (const junk of [null, undefined, "", "de", "EN", "es-ES", "français", "0"])
      expect(normalizeLanguage(junk)).toBe("fr");
  });
});
