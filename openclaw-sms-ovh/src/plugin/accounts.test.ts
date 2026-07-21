import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_TEXT_CHUNK_LIMIT,
  isConfigured,
  listAccountIds,
  normalizePhone,
  resolveAccount,
} from "./accounts.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

const configured = {
  applicationKey: "ak",
  applicationSecret: "as",
  consumerKey: "ck",
  serviceName: "sms-ab12345-1",
  virtualNumber: "+33937000000",
};

describe("normalizePhone", () => {
  it("strips formatting from an international number", () => {
    expect(normalizePhone("+33 6 12 34 56 78")).toBe("+33612345678");
    expect(normalizePhone("+33-612-345-678")).toBe("+33612345678");
  });

  it("expands a French national number to international form", () => {
    // Users write their own number the way they say it out loud.
    expect(normalizePhone("06 12 34 56 78")).toBe("+33612345678");
  });

  it("leaves an already-normalised number unchanged", () => {
    expect(normalizePhone("+33612345678")).toBe("+33612345678");
  });

  it("returns empty for input with no digits", () => {
    expect(normalizePhone("   ")).toBe("");
  });
});

describe("resolveAccount", () => {
  it("reads the channel config", () => {
    const account = resolveAccount({ channels: { "sms-ovh": configured } });
    expect(account.serviceName).toBe("sms-ab12345-1");
    expect(isConfigured(account)).toBe(true);
  });

  it("falls back to the environment for the default account", () => {
    vi.stubEnv("OVH_APPLICATION_KEY", "env-ak");
    vi.stubEnv("OVH_APPLICATION_SECRET", "env-as");
    vi.stubEnv("OVH_CONSUMER_KEY", "env-ck");
    vi.stubEnv("OVH_SMS_SERVICE_NAME", "sms-env-1");
    vi.stubEnv("OVH_SMS_VIRTUAL_NUMBER", "+33937111111");

    const account = resolveAccount({});
    expect(account.applicationKey).toBe("env-ak");
    expect(isConfigured(account)).toBe(true);
  });

  it("does NOT let a named account inherit the environment", () => {
    // Adding a second number must not silently reuse the first's credentials.
    vi.stubEnv("OVH_APPLICATION_KEY", "env-ak");

    const account = resolveAccount({ channels: { "sms-ovh": { accounts: { second: {} } } } }, "second");
    expect(account.applicationKey).toBe("");
    expect(isConfigured(account)).toBe(false);
  });

  it("prefers explicit config over the environment", () => {
    vi.stubEnv("OVH_APPLICATION_KEY", "env-ak");
    const account = resolveAccount({ channels: { "sms-ovh": { applicationKey: "cfg-ak" } } });
    expect(account.applicationKey).toBe("cfg-ak");
  });

  it("defaults the chunk limit to one concatenated GSM-7 segment", () => {
    // Not OpenClaw's 1500, which is ten segments and ten times the price.
    expect(resolveAccount({}).textChunkLimit).toBe(DEFAULT_TEXT_CHUNK_LIMIT);
    expect(DEFAULT_TEXT_CHUNK_LIMIT).toBe(153);
  });

  it("normalises the allow-list so formatting does not break matching", () => {
    const account = resolveAccount({
      channels: { "sms-ovh": { ...configured, allowFrom: ["06 12 34 56 78", "bad"] } },
    });
    expect(account.allowFrom).toContain("+33612345678");
  });

  it("defaults to a pairing policy rather than open", () => {
    expect(resolveAccount({}).dmPolicy).toBe("pairing");
  });

  it("survives a malformed config instead of throwing", () => {
    const account = resolveAccount({ channels: { "sms-ovh": { pollIntervalSeconds: "soon" } } });
    expect(account.serviceName).toBe("");
  });
});

describe("isConfigured", () => {
  it("requires the virtual number, since replies depend on it", () => {
    const account = resolveAccount({
      channels: { "sms-ovh": { ...configured, virtualNumber: undefined } },
    });
    expect(isConfigured(account)).toBe(false);
  });
});

describe("listAccountIds", () => {
  it("always includes the default account", () => {
    expect(listAccountIds({})).toEqual(["default"]);
  });

  it("includes named accounts alongside the default", () => {
    const ids = listAccountIds({ channels: { "sms-ovh": { accounts: { work: {} } } } });
    expect(ids).toEqual(["default", "work"]);
  });
});

describe("normalizePhone rejects what is not a number", () => {
  // The hole: every non-digit was stripped, so an alphanumeric sender id ending
  // in an allow-listed number normalised onto it and passed the gate.
  it("refuses a sender id wearing a number", () => {
    for (const hostile of [
      "33612345678xyz",
      "xyz33612345678",
      "FreeMsg33612345678",
      "+33612345678 <script>",
      "33 6 12 34 56 78 BONUS",
    ]) {
      expect(normalizePhone(hostile), hostile).toBe("");
    }
  });

  it("still accepts the ways a person writes their own number", () => {
    for (const written of [
      "+33612345678",
      "+33 6 12 34 56 78",
      "+33 (0)6 12.34.56.78",
      "0612345678",
      "06 12 34 56 78",
      "0033612345678",
    ]) {
      expect(normalizePhone(written), written).toBe("+33612345678");
    }
  });

  it("handles numbers that are not French", () => {
    expect(normalizePhone("+447700900123")).toBe("+447700900123");
    expect(normalizePhone("00447700900123")).toBe("+447700900123");
    expect(normalizePhone("+1 415 555 0132")).toBe("+14155550132");
  });

  it("refuses lengths that cannot be E.164", () => {
    expect(normalizePhone("12345")).toBe("");
    expect(normalizePhone("+1234567890123456789")).toBe("");
    expect(normalizePhone("")).toBe("");
  });
});
