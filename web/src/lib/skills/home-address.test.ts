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

  it("ne prend pas un numéro de rue à cinq chiffres pour un code postal", () => {
    // Banal à la campagne, standard aux États-Unis — et le dépôt est bilingue.
    // Le premier \d{5} rencontré donnait « route des Vignes, 33000 Bordeaux ».
    expect(cityFromAddress("12345 route des Vignes, 33000 Bordeaux")).toBe("Bordeaux");
    expect(cityFromAddress("12345 Main Street, 75001 Paris")).toBe("Paris");
  });

  it("préfère ne rien donner à donner la rue : sans code postal ni virgule, on demande", () => {
    // Le champ est du texte libre : rien n'impose la virgule ni le code postal.
    // Renvoyer la ligne enverrait la rue au géocodeur — exactement ce que le
    // gate ne peut pas rattraper, puisque get_directions y est libre.
    expect(cityFromAddress("12 rue des Lilas Lyon")).toBeNull();
    expect(cityFromAddress("12 rue des Lilas")).toBeNull();
  });
});
