import { describe, expect, it } from "vitest";
import { filterPhones, priceFor, sortByPrice } from "./filter";
import type { Phone } from "./types";

const base: Omit<Phone, "id" | "regions" | "nav" | "trueDumbphone"> = {
  brand: "Test",
  name: "X",
  formFactor: "candybar",
  os: "kaios",
  googleMaps: false,
  blurb: { fr: "", en: "" },
  shops: [],
};

const phones: Phone[] = [
  { ...base, id: "eu-maps", regions: ["europe"], nav: "full-maps", trueDumbphone: true, priceEur: 65, priceUsd: 70 },
  { ...base, id: "us-only", regions: ["america"], nav: "full-maps", trueDumbphone: true, priceUsd: 90 },
  { ...base, id: "global-basic", regions: ["global"], nav: "basic-nav", trueDumbphone: true, priceEur: 439, priceUsd: 479 },
  { ...base, id: "eu-punkt", regions: ["europe", "global"], nav: "location-only", trueDumbphone: true, priceEur: 299 },
  { ...base, id: "eu-nomap", regions: ["europe"], nav: "none", trueDumbphone: true, priceEur: 75 },
  { ...base, id: "eu-smartphone", regions: ["europe", "america"], nav: "full-maps", trueDumbphone: false, priceEur: 180, priceUsd: 200 },
];

describe("filterPhones — region gating", () => {
  it("no criteria returns everything", () => {
    expect(filterPhones(phones)).toHaveLength(phones.length);
  });

  it("europe includes europe-native and global, excludes america-only", () => {
    const ids = filterPhones(phones, { region: "europe" }).map((p) => p.id);
    expect(ids).toContain("eu-maps");
    expect(ids).toContain("global-basic"); // global shows in europe
    expect(ids).not.toContain("us-only");
  });

  it("america excludes europe-only phones", () => {
    const ids = filterPhones(phones, { region: "america" }).map((p) => p.id);
    expect(ids).toContain("us-only");
    expect(ids).toContain("eu-smartphone"); // also sold in america
    expect(ids).not.toContain("eu-maps");
    expect(ids).not.toContain("eu-nomap");
  });

  it("global returns only worldwide-available phones", () => {
    const ids = filterPhones(phones, { region: "global" }).map((p) => p.id);
    expect(ids).toEqual(["global-basic", "eu-punkt"]);
  });
});

describe("filterPhones — navigation need", () => {
  it("full-maps keeps only real map phones", () => {
    const ids = filterPhones(phones, { nav: "full-maps" }).map((p) => p.id);
    expect(ids).toEqual(["eu-maps", "us-only", "eu-smartphone"]);
  });

  it("any-nav keeps full-maps and basic-nav, drops location-only and none", () => {
    const ids = filterPhones(phones, { nav: "any-nav" }).map((p) => p.id);
    expect(ids).toContain("global-basic");
    expect(ids).not.toContain("eu-punkt");
    expect(ids).not.toContain("eu-nomap");
  });

  it("location-ok drops only phones with no GPS", () => {
    const ids = filterPhones(phones, { nav: "location-ok" }).map((p) => p.id);
    expect(ids).toContain("eu-punkt");
    expect(ids).not.toContain("eu-nomap");
  });
});

describe("filterPhones — type and price", () => {
  it("trueDumbphone excludes simplified smartphones", () => {
    const ids = filterPhones(phones, { trueDumbphone: true }).map((p) => p.id);
    expect(ids).not.toContain("eu-smartphone");
  });

  it("maxPrice uses EUR in europe", () => {
    const ids = filterPhones(phones, { region: "europe", maxPrice: 100 }).map((p) => p.id);
    expect(ids).toContain("eu-maps"); // 65
    expect(ids).toContain("eu-nomap"); // 75
    expect(ids).not.toContain("eu-punkt"); // 299
  });

  it("maxPrice uses USD in america", () => {
    const ids = filterPhones(phones, { region: "america", maxPrice: 100 }).map((p) => p.id);
    expect(ids).toContain("us-only"); // 90 USD
    expect(ids).not.toContain("eu-smartphone"); // 200 USD
  });

  it("keeps phones whose price is unknown for the region", () => {
    // eu-punkt has no priceUsd; in america it survives a maxPrice filter.
    const ids = filterPhones([phones[3]], { region: "america", maxPrice: 50 }).map((p) => p.id);
    expect(ids).toEqual(["eu-punkt"]);
  });

  it("combined criteria intersect", () => {
    const res = filterPhones(phones, { region: "europe", nav: "full-maps", trueDumbphone: true, maxPrice: 100 });
    expect(res.map((p) => p.id)).toEqual(["eu-maps"]);
  });

  it("over-constrained criteria return empty", () => {
    // America + turn-by-turn + under $10: every navigating phone costs more.
    expect(filterPhones(phones, { region: "america", nav: "any-nav", maxPrice: 10 })).toEqual([]);
  });
});

describe("priceFor / sortByPrice", () => {
  it("priceFor picks currency by region", () => {
    expect(priceFor(phones[0], "america")).toBe(70);
    expect(priceFor(phones[0], "europe")).toBe(65);
    expect(priceFor(phones[0], undefined)).toBe(65);
  });

  it("sortByPrice orders ascending, unknown prices last", () => {
    const ids = sortByPrice(phones, "america").map((p) => p.id);
    // us-only(90) < eu-smartphone(200) < global-basic(479); eu-maps(70) first;
    // eu-punkt & eu-nomap have no USD price -> last.
    expect(ids[0]).toBe("eu-maps");
    expect(ids.slice(-2)).toEqual(expect.arrayContaining(["eu-punkt", "eu-nomap"]));
  });
});
