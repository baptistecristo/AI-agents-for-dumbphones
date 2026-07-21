import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Un faux client Supabase qui ENREGISTRE les filtres posés, table par table.
// Les deux garanties de ce skill sont des clauses de requête ("entrant
// seulement", "scopé à cette personne") : un test qui ne regarde que la valeur
// renvoyée les laisserait disparaître sans rien casser.
const h = vi.hoisted(() => ({
  consent: null as { granted: boolean } | null,
  consentError: null as { message: string } | null,
  calls: [] as unknown[],
  callsError: null as { message: string } | null,
  filters: [] as { table: string; op: string; args: unknown[] }[],
  smsVerify: true,
}));

vi.mock("../supabase/admin", () => ({
  supabaseAdmin: () => ({
    from(table: string) {
      const record = (op: string) => (...args: unknown[]) => {
        h.filters.push({ table, op, args });
        return chain;
      };
      const chain = {
        select: record("select"),
        eq: record("eq"),
        not: record("not"),
        order: record("order"),
        maybeSingle: async () => ({ data: h.consent, error: h.consentError }),
        limit: async () => ({ data: h.calls, error: h.callsError }),
      };
      return chain;
    },
  }),
}));
vi.mock("../twilio", () => ({ smsProviderConfigured: () => h.smsVerify }));

import { getLastCallSummary, lastInboundSummary, recapConsented, recapOfferAvailable } from "./recap";
import { CallSession } from "./types";

const base: CallSession = {
  callId: "call-now",
  channel: "voice",
  userId: "u1",
  callerNumber: "+33123456789",
  verified: true,
  language: "en",
  // Required since the trusted-caller grant landed. False here on purpose:
  // these tests are about the recap, and a caller who is already verified
  // should not have the grant standing in for that.
  trustedCaller: false,
};

const inboundCall = (over: Record<string, unknown> = {}) => ({
  vapi_call_id: "call-before",
  summary: "You asked about the weather and set a reminder.",
  started_at: "2026-07-14T09:00:00.000Z",
  ...over,
});

const filtersOn = (table: string, op: string) =>
  h.filters.filter((f) => f.table === table && f.op === op).map((f) => f.args);

beforeEach(() => {
  h.consent = { granted: true };
  h.consentError = null;
  h.calls = [inboundCall()];
  h.callsError = null;
  h.filters = [];
  h.smsVerify = true;
});
afterEach(() => vi.clearAllMocks());

describe("recapConsented — opt-in, défaut éteint", () => {
  it("is true only when the register holds an explicit grant", async () => {
    expect(await recapConsented("u1")).toBe(true);
    expect(filtersOn("current_consents", "eq")).toContainEqual(["source", "call_recap"]);
    expect(filtersOn("current_consents", "eq")).toContainEqual(["user_id", "u1"]);
  });

  it("treats an absent row as a refusal: nobody is opted in by default", async () => {
    h.consent = null;
    expect(await recapConsented("u1")).toBe(false);
  });

  it("honours a revoked grant", async () => {
    h.consent = { granted: false };
    expect(await recapConsented("u1")).toBe(false);
  });

  it("fails closed when the register cannot be read", async () => {
    h.consentError = { message: "boom" };
    expect(await recapConsented("u1")).toBe(false);
  });

  it("has nothing to check for an unidentified caller", async () => {
    expect(await recapConsented(null)).toBe(false);
  });
});

describe("lastInboundSummary — un appel sortant ne ressort jamais", () => {
  // La garantie qui n'est PAS négociable : quand l'agent appelle un commerce, la
  // personne au bout du fil n'a consenti à rien. Ce filtre n'est pas un réglage,
  // et aucun consentement de l'appelant ne peut le lever.
  it("asks the database for inbound calls only", async () => {
    await lastInboundSummary("u1", null);
    expect(filtersOn("call_logs", "eq")).toContainEqual(["direction", "inbound"]);
  });

  it("scopes the read to the caller's own rows", async () => {
    await lastInboundSummary("u1", null);
    expect(filtersOn("call_logs", "eq")).toContainEqual(["user_id", "u1"]);
  });

  it("only considers finished calls that actually carry a summary", async () => {
    await lastInboundSummary("u1", null);
    expect(filtersOn("call_logs", "not")).toContainEqual(["summary", "is", null]);
    expect(filtersOn("call_logs", "not")).toContainEqual(["ended_at", "is", null]);
  });

  it("returns the newest matching call", async () => {
    expect(await lastInboundSummary("u1", null)).toEqual({
      summary: "You asked about the weather and set a reminder.",
      startedAt: "2026-07-14T09:00:00.000Z",
    });
    expect(filtersOn("call_logs", "order")).toContainEqual(["started_at", { ascending: false }]);
  });

  it("skips the call in progress and falls through to the one before it", async () => {
    h.calls = [inboundCall({ vapi_call_id: "call-now", summary: "half-written" }), inboundCall()];
    expect((await lastInboundSummary("u1", "call-now"))?.summary).toBe(
      "You asked about the weather and set a reminder.",
    );
  });

  it("returns nothing when every candidate is the call in progress", async () => {
    h.calls = [inboundCall({ vapi_call_id: "call-now" })];
    expect(await lastInboundSummary("u1", "call-now")).toBeNull();
  });

  it("ignores a blank summary rather than reading silence out loud", async () => {
    h.calls = [inboundCall({ summary: "   " })];
    expect(await lastInboundSummary("u1", null)).toBeNull();
  });

  it("returns nothing when the read fails", async () => {
    h.callsError = { message: "boom" };
    expect(await lastInboundSummary("u1", null)).toBeNull();
  });
});

describe("getLastCallSummary", () => {
  it("reads the summary back once the person opted in", async () => {
    const r = await getLastCallSummary(base);
    expect(r).toContain("You asked about the weather and set a reminder.");
  });

  it("says nothing about the content when the recap is switched off", async () => {
    h.consent = null;
    const r = await getLastCallSummary(base);
    expect(r).not.toContain("You asked about the weather");
    // Le refus dit où se trouve l'interrupteur : la personne est au téléphone,
    // elle ne tombera pas sur la page toute seule.
    expect(r).toContain("Permissions");
  });

  it("does not leak through the off switch even when a summary exists", async () => {
    h.consent = { granted: false };
    expect(await getLastCallSummary(base)).not.toContain("weather");
  });

  it("says plainly when there is no previous call to read back", async () => {
    h.calls = [];
    expect(await getLastCallSummary(base)).toContain("don't have a summary");
  });

  it("refuses an unidentified caller before touching the register", async () => {
    const r = await getLastCallSummary({ ...base, userId: null });
    expect(r).toContain("Unidentified caller");
    expect(h.filters).toHaveLength(0);
  });

  it("answers in the caller's language", async () => {
    expect(await getLastCallSummary({ ...base, language: "fr" })).toContain("Résumé de ton appel");
    expect(await getLastCallSummary({ ...base, language: "es" })).toContain("Resumen de tu llamada");
  });
});

describe("recapOfferAvailable — ce qu'on glisse dans l'accueil", () => {
  it("offers when the person opted in and a previous call has a summary", async () => {
    expect(await recapOfferAvailable("u1")).toBe(true);
  });

  it("stays quiet when the person never opted in", async () => {
    h.consent = null;
    expect(await recapOfferAvailable("u1")).toBe(false);
  });

  it("stays quiet when there is nothing to recap", async () => {
    h.calls = [];
    expect(await recapOfferAvailable("u1")).toBe(false);
  });

  // Le résumé est derrière le code jetable. Sans fournisseur de codes, ce code
  // n'arrive jamais : proposer enverrait la personne demander une chose que
  // l'instance ne sait pas livrer. Même règle que l'offre de SMS du prompt.
  it("stays quiet when no code can be sent, and never queries at all", async () => {
    h.smsVerify = false;
    expect(await recapOfferAvailable("u1")).toBe(false);
    expect(h.filters).toHaveLength(0);
  });

  it("stays quiet for an unidentified caller", async () => {
    expect(await recapOfferAvailable(null)).toBe(false);
  });
});
