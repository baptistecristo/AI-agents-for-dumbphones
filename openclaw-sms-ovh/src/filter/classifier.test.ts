import { describe, expect, it, vi } from "vitest";

import {
  buildClassifierPrompt,
  classify,
  costOf,
  parseVerdict,
  TIME2CHAT_COST,
  type CostModel,
} from "./classifier.js";
import type { Notification } from "./rules.js";

const note: Notification = {
  app: "whatsapp",
  title: "Marie",
  body: "on se voit a 18h ?",
};

const STANDARD: CostModel = { pricePerCredit: 0.06, creditsPerSegment: 1, currency: "EUR" };

describe("costOf", () => {
  it("prices a short message as one segment", () => {
    // "Marie: on se voit a 18h ?" is plain GSM-7.
    expect(costOf(note, STANDARD)).toBeCloseTo(0.06);
  });

  it("doubles the price on Time2Chat, which bills two credits per SMS", () => {
    expect(costOf(note, TIME2CHAT_COST)).toBeCloseTo(0.12);
  });

  it("charges more when an accent forces UCS-2", () => {
    // Same length, one circumflex: 160 GSM-7 chars would be one segment,
    // but as UCS-2 the capacity collapses to 70.
    const plain = { ...note, body: "a".repeat(100) };
    const accented = { ...note, body: `${"a".repeat(99)}ê` };
    expect(costOf(accented, STANDARD)).toBeGreaterThan(costOf(plain, STANDARD));
  });
});

describe("buildClassifierPrompt", () => {
  it("tells the model what this specific message costs", () => {
    const prompt = buildClassifierPrompt(note, TIME2CHAT_COST);
    expect(prompt).toContain("0.12 EUR");
  });

  it("quotes a higher figure for a message that spans more segments", () => {
    const long = { ...note, body: "mot ".repeat(120) };
    const prompt = buildClassifierPrompt(long, TIME2CHAT_COST);
    // Flat-rate prompts would say the same number here; that is the point.
    expect(prompt).not.toContain("0.12 EUR");
  });

  it("includes the sender and body so the model can judge them", () => {
    const prompt = buildClassifierPrompt(note, STANDARD);
    expect(prompt).toContain("Marie");
    expect(prompt).toContain("on se voit a 18h ?");
  });

  it("uses a caller-supplied prompt verbatim when given one", () => {
    expect(buildClassifierPrompt(note, STANDARD, "custom")).toBe("custom");
  });
});

describe("parseVerdict", () => {
  it("accepts a bare SEND in any case", () => {
    expect(parseVerdict("SEND")).toBe(true);
    expect(parseVerdict("send")).toBe(true);
    expect(parseVerdict("  Send  ")).toBe(true);
  });

  it("accepts SEND followed by an explanation", () => {
    expect(parseVerdict("SEND - she is asking a direct question")).toBe(true);
  });

  it("treats DROP and anything unrecognised as drop", () => {
    for (const raw of ["DROP", "drop", "", "   ", "maybe", "I think you should send this"]) {
      expect(parseVerdict(raw)).toBe(false);
    }
  });

  it("does not read SEND out of the middle of a sentence", () => {
    // Fails closed: an equivocating model must not cost the user money.
    expect(parseVerdict("This is borderline but I would SEND it")).toBe(false);
  });
});

describe("classify", () => {
  it("forwards when the model says SEND", async () => {
    const model = vi.fn().mockResolvedValue("SEND");
    const result = await classify(model, note, { cost: STANDARD });

    expect(result.send).toBe(true);
    expect(result.cost).toBeCloseTo(0.06);
  });

  it("drops when the model says DROP", async () => {
    const result = await classify(vi.fn().mockResolvedValue("DROP"), note, { cost: STANDARD });
    expect(result.send).toBe(false);
  });

  it("fails closed when the model throws", async () => {
    // An outage must not become a bill.
    const model = vi.fn().mockRejectedValue(new Error("connection refused"));
    const result = await classify(model, note, { cost: STANDARD });

    expect(result.send).toBe(false);
    expect(result.reason).toContain("connection refused");
  });

  it("reports the cost even when it decides to drop", async () => {
    const result = await classify(vi.fn().mockResolvedValue("DROP"), note, {
      cost: TIME2CHAT_COST,
    });
    expect(result.cost).toBeCloseTo(0.12);
  });
});
