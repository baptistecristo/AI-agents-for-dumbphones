import { describe, expect, it } from "vitest";
import {
  assertBootConfig,
  isPlaceholder,
  isSensitive,
  parseConfig,
  redactConfig,
  redactKey,
} from "./config";

// A fully-valid source. The anon key looks like a real JWT (starts with "eyJ")
// on purpose: the placeholder guard must NOT mistake it for the example value.
const valid = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abcd.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.real-anon",
  SUPABASE_SERVICE_ROLE_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.real-service-role",
  ENCRYPTION_KEY: "Zm9vYmFyZm9vYmFyZm9vYmFyZm9vYmFyMTIzNDU2Nzg=",
  RUNTIME: "selfhost",
  INBOUND_MAX_CALLS_PER_DAY: "60",
};

describe("parseConfig", () => {
  it("parses a valid source into a typed config with coerced numbers", () => {
    const cfg = parseConfig(valid);
    expect(cfg.NEXT_PUBLIC_SUPABASE_URL).toBe("https://abcd.supabase.co");
    expect(cfg.RUNTIME).toBe("selfhost");
    expect(cfg.INBOUND_MAX_CALLS_PER_DAY).toBe(60);
  });

  it("treats empty strings as absent (so KEY= lines in .env.example do not fail)", () => {
    // ORS_API_KEY= (blank) must not become a validation error.
    expect(() => parseConfig({ ...valid, ORS_API_KEY: "" })).not.toThrow();
  });

  it("throws naming a malformed URL variable", () => {
    expect(() => parseConfig({ ...valid, NEXT_PUBLIC_SUPABASE_URL: "not-a-url" })).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL/,
    );
  });

  it("throws naming a bad enum variable", () => {
    expect(() => parseConfig({ ...valid, RUNTIME: "bogus" })).toThrow(/RUNTIME/);
  });

  it("throws naming a non-numeric cap", () => {
    expect(() => parseConfig({ ...valid, INBOUND_MAX_CALLS_PER_DAY: "lots" })).toThrow(
      /INBOUND_MAX_CALLS_PER_DAY/,
    );
  });
});

describe("sensitive registry and redaction", () => {
  it("knows which keys are secrets", () => {
    for (const k of ["SUPABASE_SERVICE_ROLE_KEY", "ENCRYPTION_KEY", "TWILIO_AUTH_TOKEN", "CRON_SECRET"])
      expect(isSensitive(k)).toBe(true);
    for (const k of ["APP_URL", "NEXT_PUBLIC_BRAND_NAME", "NEXT_PUBLIC_SUPABASE_URL"])
      expect(isSensitive(k)).toBe(false);
  });

  it("masks a secret value but shows a non-secret", () => {
    expect(redactKey("ENCRYPTION_KEY", "super-secret-value")).toBe("***");
    expect(redactKey("NEXT_PUBLIC_BRAND_NAME", "Agent")).toBe("Agent");
  });

  it("redacts every secret when serializing the whole config", () => {
    const shown = redactConfig({ ...valid, TWILIO_AUTH_TOKEN: "abcdef123456" });
    expect(shown.SUPABASE_SERVICE_ROLE_KEY).toBe("***");
    expect(shown.TWILIO_AUTH_TOKEN).toBe("***");
    expect(shown.NEXT_PUBLIC_SUPABASE_URL).toBe("https://abcd.supabase.co");
    // The serialized form must not contain the raw secret anywhere.
    expect(JSON.stringify(shown)).not.toContain("abcdef123456");
  });
});

describe("placeholder boot guard", () => {
  it("recognises the .env.example placeholders", () => {
    expect(isPlaceholder("NEXT_PUBLIC_SUPABASE_URL", "https://xxxx.supabase.co")).toBe(true);
    expect(isPlaceholder("NEXT_PUBLIC_SUPABASE_ANON_KEY", "eyJ...")).toBe(true);
    expect(isPlaceholder("NEXT_PUBLIC_SUPABASE_URL", "https://abcd.supabase.co")).toBe(false);
    expect(isPlaceholder("NEXT_PUBLIC_SUPABASE_ANON_KEY", valid.NEXT_PUBLIC_SUPABASE_ANON_KEY)).toBe(false);
  });

  it("accepts a fully-configured source", () => {
    expect(() => assertBootConfig(valid)).not.toThrow();
  });

  it("refuses to boot when a required var is missing", () => {
    const missing: Record<string, string> = { ...valid };
    delete missing.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => assertBootConfig(missing)).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("refuses to boot when a required var still holds its placeholder", () => {
    expect(() => assertBootConfig({ ...valid, NEXT_PUBLIC_SUPABASE_URL: "https://xxxx.supabase.co" })).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL/,
    );
  });
});
