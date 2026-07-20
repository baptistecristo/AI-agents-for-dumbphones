import { describe, expect, it } from "vitest";

import { escapeNonAscii, OvhApiError, OvhClient, signRequest } from "./client.js";

/**
 * Reference vectors computed independently from OVH's documented formula:
 *   "$1$" + sha1(AS + "+" + CK + "+" + METHOD + "+" + URL + "+" + BODY + "+" + TS)
 * Hardcoded so a refactor that changes the joining or hashing is caught.
 */
const AS = "test-secret";
const CK = "test-consumer";
const TS = 1_700_000_000;
const JOBS_URL = "https://eu.api.ovh.com/1.0/sms/sms-ab12345-1/jobs";
const ESCAPED_BODY = '{"message":"pr\\u00eat","receivers":["+33612345678"]}';
const RAW_BODY = '{"message":"prêt","receivers":["+33612345678"]}';
const SIG_ESCAPED = "$1$2230575e47213bd68ce50b9b1accfbe773b4829a";
const SIG_RAW = "$1$67f1aba0154d589c7c7fbf6c507af61a5413a8ce";
const SIG_GET = "$1$1e21a4d9556fdae8dacf2d485372061575467fc1";

interface Call {
  url: string;
  init: RequestInit | undefined;
}

function recordingFetch(responses: Array<{ status?: number; body: string }>) {
  const calls: Call[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const next = responses.shift() ?? { body: "" };
    return new Response(next.body, { status: next.status ?? 200 });
  }) as typeof globalThis.fetch;
  return { impl, calls };
}

function clientWith(responses: Array<{ status?: number; body: string }>, nowSeconds = TS) {
  const { impl, calls } = recordingFetch(responses);
  const client = new OvhClient(
    { applicationKey: "test-app", applicationSecret: AS, consumerKey: CK },
    { fetch: impl, now: () => nowSeconds * 1000 },
  );
  return { client, calls };
}

describe("escapeNonAscii", () => {
  it("leaves ASCII untouched", () => {
    expect(escapeNonAscii('{"a":"b"}')).toBe('{"a":"b"}');
  });

  it("escapes accented characters", () => {
    expect(escapeNonAscii(RAW_BODY)).toBe(ESCAPED_BODY);
  });

  it("escapes an astral emoji as its two surrogate halves", () => {
    // JSON has no single escape for an astral codepoint; it uses the pair.
    expect(escapeNonAscii(JSON.stringify({ m: "📞" }))).toBe('{"m":"\\ud83d\\udcde"}');
  });
});

describe("signRequest", () => {
  it("matches the reference vector", () => {
    expect(
      signRequest({
        applicationSecret: AS,
        consumerKey: CK,
        method: "POST",
        url: JOBS_URL,
        body: ESCAPED_BODY,
        timestamp: TS,
      }),
    ).toBe(SIG_ESCAPED);
  });

  it("signs an empty body for GET", () => {
    expect(
      signRequest({
        applicationSecret: AS,
        consumerKey: CK,
        method: "GET",
        url: "https://eu.api.ovh.com/1.0/sms",
        body: "",
        timestamp: TS,
      }),
    ).toBe(SIG_GET);
  });

  it("produces a different signature for escaped and unescaped bodies", () => {
    // This is the whole reason escaping happens before signing: sign one form
    // and send the other, and every accented message is rejected.
    expect(SIG_ESCAPED).not.toBe(SIG_RAW);
  });

  it("uppercases the method", () => {
    const lower = signRequest({
      applicationSecret: AS,
      consumerKey: CK,
      method: "post",
      url: JOBS_URL,
      body: ESCAPED_BODY,
      timestamp: TS,
    });
    expect(lower).toBe(SIG_ESCAPED);
  });

  it("changes when any single input changes", () => {
    const base = {
      applicationSecret: AS,
      consumerKey: CK,
      method: "POST",
      url: JOBS_URL,
      body: ESCAPED_BODY,
      timestamp: TS,
    };
    const variants = [
      { ...base, applicationSecret: "other" },
      { ...base, consumerKey: "other" },
      { ...base, method: "PUT" },
      { ...base, url: `${JOBS_URL}?x=1` },
      { ...base, body: "" },
      { ...base, timestamp: TS + 1 },
    ];
    for (const variant of variants) {
      expect(signRequest(variant)).not.toBe(SIG_ESCAPED);
    }
  });
});

describe("OvhClient", () => {
  it("synchronises the clock before the first signed call", async () => {
    const { client, calls } = clientWith([
      { body: String(TS) },
      { body: '{"ids":[1]}' },
    ]);
    await client.get("/sms");

    expect(calls[0]?.url).toBe("https://eu.api.ovh.com/1.0/auth/time");
    expect(calls[1]?.url).toBe("https://eu.api.ovh.com/1.0/sms");
  });

  it("only synchronises once", async () => {
    const { client, calls } = clientWith([
      { body: String(TS) },
      { body: "[]" },
      { body: "[]" },
    ]);
    await client.get("/sms");
    await client.get("/sms");

    const timeCalls = calls.filter((c) => c.url.endsWith("/auth/time"));
    expect(timeCalls).toHaveLength(1);
  });

  it("applies the server clock drift to the timestamp it signs", async () => {
    // Local clock is 300s behind OVH's; every signed call must compensate.
    const { client, calls } = clientWith([{ body: String(TS + 300) }, { body: "[]" }]);
    await client.get("/sms");

    const headers = calls[1]?.init?.headers as Record<string, string>;
    expect(headers["X-Ovh-Timestamp"]).toBe(String(TS + 300));
  });

  it("sends the escaped body verbatim and signs that same string", async () => {
    const { client, calls } = clientWith([{ body: String(TS) }, { body: "{}" }]);
    await client.post("/sms/sms-ab12345-1/jobs", {
      message: "prêt",
      receivers: ["+33612345678"],
    });

    const sent = calls[1];
    expect(sent?.init?.body).toBe(ESCAPED_BODY);
    const headers = sent?.init?.headers as Record<string, string>;
    expect(headers["X-Ovh-Signature"]).toBe(SIG_ESCAPED);
  });

  it("sets the identifying headers", async () => {
    const { client, calls } = clientWith([{ body: String(TS) }, { body: "[]" }]);
    await client.get("/sms");

    const headers = calls[1]?.init?.headers as Record<string, string>;
    expect(headers["X-Ovh-Application"]).toBe("test-app");
    expect(headers["X-Ovh-Consumer"]).toBe(CK);
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("omits a body on GET rather than sending an empty string", async () => {
    const { client, calls } = clientWith([{ body: String(TS) }, { body: "[]" }]);
    await client.get("/sms");
    expect(calls[1]?.init?.body).toBeUndefined();
  });

  it("throws OvhApiError carrying the status and response text", async () => {
    const { client } = clientWith([
      { body: String(TS) },
      { status: 403, body: '{"message":"Invalid signature"}' },
      { status: 403, body: '{"message":"Invalid signature"}' },
    ]);

    await expect(client.get("/sms")).rejects.toThrowError(OvhApiError);
    await expect(client.get("/sms")).rejects.toThrowError(/Invalid signature/);
  });

  it("returns undefined for an empty response rather than failing to parse", async () => {
    const { client } = clientWith([{ body: String(TS) }, { body: "" }]);
    await expect(client.delete("/sms/x/incoming/1")).resolves.toBeUndefined();
  });

  it("rejects a non-numeric /auth/time response", async () => {
    const { client } = clientWith([{ body: "not-a-number" }]);
    await expect(client.get("/sms")).rejects.toThrowError(/non-numeric/);
  });
});
