import { describe, expect, it } from "vitest";
import {
  ACTION_ITEMS_CONSENT,
  buildExtractionPrompt,
  extractionVerdict,
  parseActionItems,
  type CallForExtraction,
} from "./action-items";

const NOW = new Date("2026-07-20T10:00:00.000Z");

const call = (over: Partial<CallForExtraction> = {}): CallForExtraction => ({
  id: "call-1",
  user_id: "user-1",
  direction: "inbound",
  transcript: "Caller: I'll call the pharmacy back tomorrow morning.",
  ...over,
});

const allowed = { consentGranted: true, alreadyExtracted: false, modelConfigured: true };

describe("extractionVerdict", () => {
  it("extracts from an inbound call whose caller opted in", () => {
    expect(extractionVerdict(call(), allowed)).toEqual({ extract: true });
  });

  it("never touches an outbound call, even when the account opted in", () => {
    // L'appel sortant enregistre un tiers qui n'a rien accepté. Le
    // consentement du compte qui déclenche l'appel ne parle pas pour lui.
    const verdict = extractionVerdict(call({ direction: "outbound" }), allowed);
    expect(verdict).toEqual({ extract: false, reason: "appel non entrant" });
  });

  it("refuses before consent is even considered on an outbound call", () => {
    // La raison rendue prouve l'ORDRE : si le refus venait du consentement, un
    // jour où consentGranted passerait à true par erreur, l'appel sortant
    // partirait. Ici il est refusé sur sa direction, avant tout le reste.
    const verdict = extractionVerdict(call({ direction: "outbound" }), {
      ...allowed,
      consentGranted: false,
    });
    expect(verdict).toEqual({ extract: false, reason: "appel non entrant" });
  });

  it("refuses without the action_items consent (default is off)", () => {
    expect(extractionVerdict(call(), { ...allowed, consentGranted: false })).toEqual({
      extract: false,
      reason: "consentement action_items absent",
    });
  });

  it("refuses for an unidentified caller: no account, no consent register", () => {
    expect(extractionVerdict(call({ user_id: null }), allowed)).toEqual({
      extract: false,
      reason: "appelant non identifié",
    });
  });

  it("refuses a replayed end-of-call report", () => {
    expect(extractionVerdict(call(), { ...allowed, alreadyExtracted: true })).toEqual({
      extract: false,
      reason: "déjà extrait",
    });
  });

  it("refuses an empty or blank transcript", () => {
    for (const transcript of [null, "", "   \n  "]) {
      expect(extractionVerdict(call({ transcript }), allowed).extract).toBe(false);
    }
  });

  it("refuses when no model key is configured instead of failing later", () => {
    expect(extractionVerdict(call(), { ...allowed, modelConfigured: false })).toEqual({
      extract: false,
      reason: "aucune clé de modèle configurée",
    });
  });

  it("names the consent source the register stores", () => {
    expect(ACTION_ITEMS_CONSENT).toBe("action_items");
  });
});

describe("buildExtractionPrompt", () => {
  it("asks for the reminder text in the language of the call", () => {
    expect(buildExtractionPrompt("fr", NOW)).toContain("in French");
    expect(buildExtractionPrompt("en", NOW)).toContain("in English");
    expect(buildExtractionPrompt("es", NOW)).toContain("in Spanish");
  });

  it("dates the call so relative deadlines resolve", () => {
    expect(buildExtractionPrompt("fr", NOW)).toContain("2026-07-20T10:00:00.000Z");
  });

  it("tells the model to answer with an empty array rather than invent", () => {
    const prompt = buildExtractionPrompt("en", NOW);
    expect(prompt).toContain("[]");
    expect(prompt).toContain("Never invent a deadline");
  });
});

describe("parseActionItems", () => {
  it("reads a plain JSON array", () => {
    const raw = '[{"text":"Call the pharmacy back","due_at":"2026-07-21T08:00:00.000Z"}]';
    expect(parseActionItems(raw, NOW)).toEqual([
      { text: "Call the pharmacy back", due_at: "2026-07-21T08:00:00.000Z" },
    ]);
  });

  it("reads a fenced array", () => {
    const raw = '```json\n[{"text":"Send the form","due_at":null}]\n```';
    expect(parseActionItems(raw, NOW)).toEqual([{ text: "Send the form", due_at: null }]);
  });

  it("digs the array out of surrounding prose", () => {
    const raw = 'Here are the commitments:\n[{"text":"Book the taxi","due_at":null}]\nHope this helps.';
    expect(parseActionItems(raw, NOW)).toEqual([{ text: "Book the taxi", due_at: null }]);
  });

  it("returns nothing on an empty array, prose only, or unparseable output", () => {
    for (const raw of ["[]", "", "   ", "No commitments were made.", "{not json", '{"text":"x"}']) {
      expect(parseActionItems(raw, NOW)).toEqual([]);
    }
  });

  it("drops entries without usable text instead of writing them", () => {
    const raw = '[{"due_at":null},{"text":""},{"text":"   "},{"text":42},null,"nope",{"text":"Real one"}]';
    expect(parseActionItems(raw, NOW)).toEqual([{ text: "Real one", due_at: null }]);
  });

  it("drops a deadline already in the past: the cron sends anything due", () => {
    // Un rappel daté d'hier part à la minute suivante. Sans date, il est gardé
    // et relisible — c'est le comportement voulu, pas une perte.
    const raw = '[{"text":"Call back","due_at":"2026-07-19T08:00:00.000Z"}]';
    expect(parseActionItems(raw, NOW)).toEqual([{ text: "Call back", due_at: null }]);
  });

  it("drops a deadline more than a year out, and an unparseable one", () => {
    const raw =
      '[{"text":"Far","due_at":"2028-01-01T08:00:00.000Z"},{"text":"Bad","due_at":"next tuesday"}]';
    expect(parseActionItems(raw, NOW)).toEqual([
      { text: "Far", due_at: null },
      { text: "Bad", due_at: null },
    ]);
  });

  it("keeps a deadline inside the window", () => {
    const raw = '[{"text":"Dentist","due_at":"2026-09-01T09:30:00.000Z"}]';
    expect(parseActionItems(raw, NOW)[0].due_at).toBe("2026-09-01T09:30:00.000Z");
  });

  it("deduplicates the same commitment restated", () => {
    const raw = '[{"text":"Call the pharmacy"},{"text":"call the PHARMACY"},{"text":"Buy bread"}]';
    expect(parseActionItems(raw, NOW).map((i) => i.text)).toEqual(["Call the pharmacy", "Buy bread"]);
  });

  it("caps the number of items so one call cannot flood the reminder list", () => {
    const raw = JSON.stringify(Array.from({ length: 12 }, (_, i) => ({ text: `Task ${i}` })));
    expect(parseActionItems(raw, NOW)).toHaveLength(5);
  });

  it("caps the length of a single item", () => {
    const raw = JSON.stringify([{ text: "x".repeat(500) }]);
    expect(parseActionItems(raw, NOW)[0].text).toHaveLength(200);
  });
});
