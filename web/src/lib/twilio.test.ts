import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { smsProviderConfigured } from "./twilio";

const KEYS = ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_VERIFY_SERVICE_SID", "TWILIO_FROM_NUMBER"] as const;

describe("smsProviderConfigured", () => {
  const saved = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const k of KEYS) {
      saved.set(k, process.env[k]);
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of KEYS) {
      const v = saved.get(k);
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("returns false instead of throwing when nothing is configured", () => {
    expect(smsProviderConfigured("verify")).toBe(false);
    expect(smsProviderConfigured("send")).toBe(false);
  });

  it("needs the account credentials on both paths", () => {
    process.env.TWILIO_VERIFY_SERVICE_SID = "VA0000";
    process.env.TWILIO_FROM_NUMBER = "+33612345678";
    expect(smsProviderConfigured("verify")).toBe(false);
    expect(smsProviderConfigured("send")).toBe(false);
  });

  it("keeps the verify path and the send path independent", () => {
    process.env.TWILIO_ACCOUNT_SID = "AC0000";
    process.env.TWILIO_AUTH_TOKEN = "token";
    expect(smsProviderConfigured("verify")).toBe(false);
    expect(smsProviderConfigured("send")).toBe(false);

    process.env.TWILIO_VERIFY_SERVICE_SID = "VA0000";
    expect(smsProviderConfigured("verify")).toBe(true);
    expect(smsProviderConfigured("send")).toBe(false);

    process.env.TWILIO_FROM_NUMBER = "+33612345678";
    expect(smsProviderConfigured("send")).toBe(true);
  });
});
