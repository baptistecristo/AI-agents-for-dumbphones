import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted : les fabriques vi.mock ne voient rien d'autre.
const h = vi.hoisted(() => ({
  // Ce que la « base » renvoie pour la prochaine lecture, par table/vue lue.
  rows: {} as Record<string, { data: unknown; error: unknown }>,
  // Ce qui a réellement été demandé : table lue, filtres posés, lignes insérées.
  reads: [] as { table: string; filters: Record<string, unknown>; notNull: string[] }[],
  inserts: [] as { table: string; row: Record<string, unknown> }[],
  insertError: null as unknown,
}));

vi.mock("./supabase/admin", () => ({
  supabaseAdmin: () => ({
    from(table: string) {
      const read = { table, filters: {} as Record<string, unknown>, notNull: [] as string[] };
      const chain = {
        select: () => chain,
        eq: (column: string, value: unknown) => {
          read.filters[column] = value;
          return chain;
        },
        not: (column: string) => {
          read.notNull.push(column);
          return chain;
        },
        maybeSingle: async () => {
          h.reads.push(read);
          return h.rows[table] ?? { data: null, error: null };
        },
        insert: async (row: Record<string, unknown>) => {
          h.inserts.push({ table, row });
          return { error: h.insertError };
        },
      };
      return chain;
    },
  }),
}));

import { TRUSTED_CALLER_SOURCE, callerIsTrusted, recordCallerTrust } from "./consent";

const CALLER = "+33612345678";
const USER = "user-1";

beforeEach(() => {
  h.rows = {};
  h.reads = [];
  h.inserts = [];
  h.insertError = null;
});
afterEach(() => vi.clearAllMocks());

describe("callerIsTrusted", () => {
  it("says no when the register holds nothing for that number", () => {
    // Défaut ÉTEINT : l'absence de ligne vaut refus, elle ne vaut pas « à voir ».
    return expect(callerIsTrusted(USER, CALLER)).resolves.toBe(false);
  });

  it("says yes on a live grant", async () => {
    h.rows.current_caller_consents = { data: { granted: true }, error: null };
    expect(await callerIsTrusted(USER, CALLER)).toBe(true);
  });

  it("says no once the grant is revoked", async () => {
    // Révoquer, c'est AJOUTER une ligne granted=false : le registre est
    // append-only, donc la vue est le seul endroit qui sache laquelle compte.
    h.rows.current_caller_consents = { data: { granted: false }, error: null };
    expect(await callerIsTrusted(USER, CALLER)).toBe(false);
  });

  it("reads the view, never the raw table, and scopes the read to one number", async () => {
    // Le test qui protège la révocation. consents contient AUSSI les grants
    // retirés ; y piocher une ligne ressusciterait un consentement révoqué.
    // La vue tranche par date, une fois, au bon endroit.
    await callerIsTrusted(USER, CALLER);
    expect(h.reads).toHaveLength(1);
    expect(h.reads[0].table).toBe("current_caller_consents");
    expect(h.reads[0].filters).toEqual({
      user_id: USER,
      source: TRUSTED_CALLER_SOURCE,
      subject: CALLER,
    });
  });

  it("fails closed when the database errors, and says so in the logs", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    h.rows.current_caller_consents = { data: null, error: { message: "relation does not exist" } };
    expect(await callerIsTrusted(USER, CALLER)).toBe(false);
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it("does not even ask without an account or without a number", async () => {
    expect(await callerIsTrusted(null, CALLER)).toBe(false);
    expect(await callerIsTrusted(USER, null)).toBe(false);
    expect(h.reads).toHaveLength(0);
  });
});

describe("recordCallerTrust", () => {
  const verifiedPhone = { data: { e164: CALLER }, error: null };

  it("grants only for a verified number of that very account", async () => {
    h.rows.phones = verifiedPhone;
    expect(await recordCallerTrust(USER, CALLER, true, "note")).toBe(true);
    expect(h.reads[0].table).toBe("phones");
    expect(h.reads[0].filters).toEqual({ user_id: USER, e164: CALLER });
    expect(h.reads[0].notNull).toContain("verified_at");
    expect(h.inserts).toEqual([
      {
        table: "consents",
        row: {
          user_id: USER,
          source: TRUSTED_CALLER_SOURCE,
          subject: CALLER,
          granted: true,
          scope_note: "note",
        },
      },
    ]);
  });

  it("writes nothing for a number this account does not own, or has not verified", async () => {
    // Le champ caché du formulaire se trafique : une Server Action se poste
    // directement. Sans cette relecture, il suffirait de changer un numéro dans
    // la requête pour se déclarer de confiance chez quelqu'un d'autre.
    h.rows.phones = { data: null, error: null };
    expect(await recordCallerTrust(USER, "+33600000000", true, "note")).toBe(false);
    expect(h.inserts).toHaveLength(0);
  });

  it("revokes by adding a row, never by deleting one", async () => {
    h.rows.phones = verifiedPhone;
    expect(await recordCallerTrust(USER, CALLER, false, "note")).toBe(true);
    expect(h.inserts).toHaveLength(1);
    expect(h.inserts[0].row.granted).toBe(false);
    // Même table, même forme : la trace du grant d'origine reste lisible.
    expect(h.inserts[0].table).toBe("consents");
  });

  it("reports a failed write instead of pretending the choice landed", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    h.rows.phones = verifiedPhone;
    h.insertError = { message: "insert failed" };
    expect(await recordCallerTrust(USER, CALLER, true, "note")).toBe(false);
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});
