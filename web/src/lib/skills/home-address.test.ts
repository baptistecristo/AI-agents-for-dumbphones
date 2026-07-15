// L'adresse du domicile ne sort pas sans code. Le gate (gate.ts) ne peut pas le
// garantir seul : get_directions y est libre, et c'est son ARGUMENT d'origine
// qui est protégé. Ces tests tiennent cette frontière-là.

import { describe, expect, it } from "vitest";
import { cityFromAddress } from "./index";

describe("cityFromAddress", () => {
  it("ne garde que la ville : ce qui part au géocodeur ne doit pas nommer la rue", () => {
    expect(cityFromAddress("12 rue des Lilas, 69003 Lyon")).toBe("Lyon");
    expect(cityFromAddress("12 rue des Lilas 69003 Lyon")).toBe("Lyon");
    expect(cityFromAddress("3 impasse du Puits, 29200 Brest")).toBe("Brest");
  });

  it("garde les villes en plusieurs mots", () => {
    expect(cityFromAddress("5 av. Foch, 06400 Cannes la Bocca")).toBe("Cannes la Bocca");
  });

  it("accepte une ville seule et ignore le vide", () => {
    expect(cityFromAddress("Lyon")).toBe("Lyon");
    expect(cityFromAddress(null)).toBeNull();
    expect(cityFromAddress("   ")).toBeNull();
  });
});
