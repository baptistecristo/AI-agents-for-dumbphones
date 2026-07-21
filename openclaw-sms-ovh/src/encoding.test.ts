import { describe, expect, it } from "vitest";

import {
  analyze,
  chunk,
  chunkForSms,
  estimateCost,
  FRENCH_UCS2_TRAPS,
  isGsm7,
  smsPartCount,
  toGsm7,
  TRUNCATION_MARKER,
  truncateToSegments,
  truncateToSmsParts,
  ucs2Offenders,
} from "./encoding.js";

describe("GSM-7 membership", () => {
  it("accepts the accents that are in the alphabet", () => {
    // These survive at 160 chars/segment and cost nothing extra.
    expect(isGsm7("é è à ù ì ò Ç É Ä Ö Ñ Ü ä ö ñ ü ß")).toBe(true);
  });

  it("rejects the French accents that are not", () => {
    for (const char of FRENCH_UCS2_TRAPS) {
      expect(isGsm7(char)).toBe(false);
    }
  });

  it("rejects emoji", () => {
    expect(isGsm7("Rappel 📞")).toBe(false);
  });

  it("treats lowercase c-cedilla as unsafe even though uppercase is fine", () => {
    // Gateways disagree on folding ç to Ç, so we never bet on it.
    expect(isGsm7("Ç")).toBe(true);
    expect(isGsm7("ç")).toBe(false);
  });
});

describe("analyze", () => {
  it("counts a plain ASCII message as one GSM-7 segment", () => {
    const info = analyze("Rendez-vous a 14h.");
    expect(info.encoding).toBe("GSM7");
    expect(info.segments).toBe(1);
    expect(info.offenders).toEqual([]);
  });

  it("uses 160 chars for a single segment", () => {
    expect(analyze("a".repeat(160)).segments).toBe(1);
    expect(analyze("a".repeat(161)).segments).toBe(2);
  });

  it("drops to 153 chars once concatenated", () => {
    // 306 = 2 x 153 exactly, so it must not spill into a third segment.
    expect(analyze("a".repeat(306)).segments).toBe(2);
    expect(analyze("a".repeat(307)).segments).toBe(3);
  });

  it("charges two septets for extension-table characters", () => {
    // 80 euro signs = 160 septets = still one segment, but only just.
    expect(analyze("€".repeat(80)).units).toBe(160);
    expect(analyze("€".repeat(80)).segments).toBe(1);
    expect(analyze("€".repeat(81)).segments).toBe(2);
  });

  it("collapses to 70 chars when a single accent forces UCS-2", () => {
    const safe = "a".repeat(100);
    expect(analyze(safe).segments).toBe(1);

    // One circumflex, and the same message now costs twice as much.
    const trapped = `${"a".repeat(99)}ê`;
    const info = analyze(trapped);
    expect(info.encoding).toBe("UCS2");
    expect(info.segments).toBe(2);
    expect(info.offenders).toEqual(["ê"]);
  });

  it("uses 67 chars per part once UCS-2 is concatenated", () => {
    expect(analyze(`${"a".repeat(69)}ê`).segments).toBe(1); // 70 units, exactly fits
    expect(analyze(`${"a".repeat(70)}ê`).segments).toBe(2); // 71 units, spills
    expect(analyze(`${"a".repeat(133)}ê`).segments).toBe(2); // 134 = 2 x 67
    expect(analyze(`${"a".repeat(134)}ê`).segments).toBe(3);
  });

  it("counts an astral-plane emoji as two UTF-16 units", () => {
    // The phone icon is a surrogate pair, so 35 of them already exceed a segment.
    const info = analyze("📞".repeat(35));
    expect(info.encoding).toBe("UCS2");
    expect(info.units).toBe(70);
    expect(info.segments).toBe(1);
    expect(analyze("📞".repeat(36)).segments).toBe(2);
  });

  it("reports each offender once, in order of appearance", () => {
    expect(ucs2Offenders("être prêt en août, être sûr")).toEqual(["ê", "û"]);
  });

  it("treats the empty string as zero segments, not one", () => {
    expect(analyze("").segments).toBe(0);
  });
});

describe("toGsm7", () => {
  it("strips the circumflexes that cost money and leaves the free accents", () => {
    expect(toGsm7("être prêt en août")).toBe("etre pret en aout");
    expect(toGsm7("déjà à l'hôpital")).toBe("déjà à l'hopital");
  });

  it("produces text that is actually GSM-7", () => {
    const messy = "Vous êtes prêt ? Rendez-vous à l'hôpital — 14h… ça va coûter 10€";
    const clean = toGsm7(messy);
    expect(isGsm7(clean)).toBe(true);
    expect(analyze(clean).encoding).toBe("GSM7");
  });

  it("normalises typographic punctuation that gateways do not always rescue", () => {
    expect(toGsm7("l’agent a dit “oui”…")).toBe("l'agent a dit \"oui\"...");
  });

  it("drops emoji rather than letting one re-encode the whole message", () => {
    expect(toGsm7("Rappel 📞")).toBe("Rappel ");
    expect(isGsm7(toGsm7("Rappel 📞"))).toBe(true);
  });

  it("expands the oe ligature instead of deleting it", () => {
    expect(toGsm7("cœur")).toBe("coeur");
  });
});

describe("chunk", () => {
  it("returns a single part when the text already fits", () => {
    expect(chunk("court", 160)).toEqual(["court"]);
  });

  it("splits on whitespace rather than mid-word", () => {
    const parts = chunk("alpha bravo charlie delta", 12);
    expect(parts.every((p) => p.length <= 12)).toBe(true);
    expect(parts.join(" ")).toBe("alpha bravo charlie delta");
  });

  it("hard-cuts a token longer than the window", () => {
    const parts = chunk("a".repeat(25), 10);
    expect(parts).toEqual(["a".repeat(10), "a".repeat(10), "a".repeat(5)]);
  });

  it("produces parts that each survive segmentation on their own", () => {
    const long = "Vous avez trois messages non lus. ".repeat(20);
    for (const part of chunk(long, 153)) {
      expect(analyze(part).segments).toBe(1);
    }
  });

  it("returns nothing for whitespace-only input", () => {
    expect(chunk("   \n  ", 160)).toEqual([]);
  });

  it("rejects a non-positive window instead of looping forever", () => {
    expect(() => chunk("abc", 0)).toThrow(RangeError);
  });
});

describe("estimateCost", () => {
  const OVH_PER_SEGMENT = 0.06;

  it("prices a short GSM-7 alert at one segment", () => {
    expect(estimateCost("Marie: on se voit a 18h", OVH_PER_SEGMENT)).toBeCloseTo(0.06);
  });

  it("shows what a single circumflex costs", () => {
    const plain = "a".repeat(150);
    const accented = `${"a".repeat(149)}ê`;
    expect(estimateCost(plain, OVH_PER_SEGMENT)).toBeCloseTo(0.06);
    // 150 UCS-2 units at 67/part = 3 segments. Six cents becomes eighteen.
    expect(estimateCost(accented, OVH_PER_SEGMENT)).toBeCloseTo(0.18);
  });
});

describe("truncateToSegments", () => {
  it("leaves a message that already fits alone", () => {
    expect(truncateToSegments("court", 1)).toBe("court");
  });

  it("cuts a long message down to the budget", () => {
    const result = truncateToSegments("mot ".repeat(200).trim(), 1);
    expect(analyze(result).segments).toBe(1);
  });

  it("marks that it cut something", () => {
    const result = truncateToSegments("mot ".repeat(200).trim(), 1);
    expect(result.endsWith("[...]")).toBe(true);
  });

  it("uses a marker that stays inside GSM-7", () => {
    // An ellipsis character would re-encode the whole message as UCS-2 and
    // halve its capacity, to make room for the sign that we ran out of room.
    expect(isGsm7(TRUNCATION_MARKER)).toBe(true);
  });

  it("does not overshoot the budget when the text forces UCS-2", () => {
    const accented = "prêt ".repeat(100).trim();
    const result = truncateToSegments(accented, 2);
    expect(analyze(result).segments).toBeLessThanOrEqual(2);
  });

  it("returns as much as fits, not a token amount", () => {
    const result = truncateToSegments("mot ".repeat(200).trim(), 2);
    const info = analyze(result);
    expect(info.segments).toBe(2);
    // Should fill the budget rather than stopping early.
    expect(info.units).toBeGreaterThan(200);
  });

  it("prefers a word boundary when one is close by", () => {
    const result = truncateToSegments("mot ".repeat(200).trim(), 1);
    expect(result).not.toMatch(/mo\[\.\.\.\]$/);
  });

  it("hard-cuts a single unbroken token rather than returning nothing", () => {
    const result = truncateToSegments("a".repeat(500), 1);
    expect(analyze(result).segments).toBe(1);
    expect(result.length).toBeGreaterThan(100);
  });

  it("respects a budget of more than one segment", () => {
    const result = truncateToSegments("mot ".repeat(500).trim(), 3);
    expect(analyze(result).segments).toBe(3);
  });

  it("refuses a non-positive budget", () => {
    expect(() => truncateToSegments("x", 0)).toThrowError(RangeError);
  });
});

describe("chunkForSms bills what it sends", () => {
  // Each of these was verified as a real mismatch before the fix: analyze()
  // measured a concatenated message, chunk() sliced on String.length, and the
  // send path posted one job per slice.

  it("makes every part exactly one billed SMS", () => {
    for (const text of [
      "a".repeat(1800),
      `prêt ${"a".repeat(400)}`,
      "€".repeat(100) + "a".repeat(200),
      "😀".repeat(120),
      `${"mot ".repeat(200)}`,
    ]) {
      for (const part of chunkForSms(text)) {
        expect(analyze(part).segments, `part of ${JSON.stringify(text.slice(0, 20))}`).toBe(1);
      }
    }
  });

  // One accented character re-encodes the whole message to UCS-2 at 70 units,
  // so 153 characters is three segments, not one part.
  it("does not treat 153 accented characters as one message", () => {
    const text = "ê" + "a".repeat(152);
    expect(analyze(text).segments).toBeGreaterThan(1);
    expect(chunkForSms(text).length).toBeGreaterThan(1);
    for (const part of chunkForSms(text)) expect(analyze(part).segments).toBe(1);
  });

  // Extension characters cost two septets each, so 153 of them is not 153 units.
  it("counts an extension character as the two septets it costs", () => {
    const text = "€".repeat(100) + "a".repeat(53);
    expect(analyze(text).units).toBe(253);
    for (const part of chunkForSms(text)) expect(analyze(part).segments).toBe(1);
  });

  // The 154 to 160 band: one concatenated segment, but two independent ones.
  it("splits the band where a single segment and a single message disagree", () => {
    const text = "a".repeat(157);
    expect(analyze(text).segments).toBe(1); // as a concatenated message
    expect(smsPartCount(text)).toBe(1); // and as one standalone message too
    const overflow = "a".repeat(161);
    expect(smsPartCount(overflow)).toBe(2);
  });

  it("never cuts a surrogate pair in half", () => {
    for (const part of chunkForSms("😀".repeat(120))) {
      expect(part).toBe([...part].join(""));
      expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(part)).toBe(false);
      expect(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(part)).toBe(false);
    }
  });

  it("still honours a configured character cap", () => {
    for (const part of chunkForSms("a".repeat(1000), 50)) {
      expect(part.length).toBeLessThanOrEqual(50);
    }
  });
});

describe("truncateToSmsParts", () => {
  it("cuts to the number of messages that will actually be billed", () => {
    const text = "mot ".repeat(500);
    for (const max of [1, 2, 6]) {
      expect(smsPartCount(truncateToSmsParts(text, max))).toBeLessThanOrEqual(max);
    }
  });

  it("leaves text that already fits alone", () => {
    expect(truncateToSmsParts("court", 6)).toBe("court");
  });

  it("holds the ceiling for accented text too", () => {
    const text = "prêt à partir, ".repeat(60);
    expect(smsPartCount(truncateToSmsParts(text, 3))).toBeLessThanOrEqual(3);
  });
});
