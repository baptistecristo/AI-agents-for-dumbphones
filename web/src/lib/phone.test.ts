import { describe, expect, it } from "vitest";
import { isE164 } from "./phone";

describe("isE164", () => {
  it("accepts valid E.164 numbers", () => {
    for (const g of ["+33612345678", "+15551234567", "+441632960961"]) expect(isE164(g)).toBe(true);
  });
  it("rejects national format, junk, and empty", () => {
    for (const b of ["0612345678", "+0611", "+33 6 12 34 56 78", "not a number", "", "33612345678", "+"])
      expect(isE164(b)).toBe(false);
  });
});
