import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted so the vi.mock factories can reference them.
const h = vi.hoisted(() => ({ insert: vi.fn(), smsOn: true }));

vi.mock("../supabase/admin", () => ({
  supabaseAdmin: () => ({ from: () => ({ insert: h.insert }) }),
}));
vi.mock("../twilio", () => ({
  smsProviderConfigured: () => h.smsOn,
}));

import { reportGap } from "./gap";
import { CallSession } from "./types";

const base: CallSession = { callId: "c1", userId: null, callerNumber: "+33123456789", verified: false, language: "en" };

beforeEach(() => {
  h.insert.mockReset();
  h.insert.mockResolvedValue({ error: null });
  h.smsOn = true;
});
afterEach(() => vi.clearAllMocks());

describe("reportGap", () => {
  it("promises an SMS only when opted in, with a number, and SMS configured", async () => {
    const r = await reportGap({ ...base }, { request_summary: "x", notify_caller: true });
    expect(r).toContain("I'll text you");
    expect(h.insert).toHaveBeenCalledWith(expect.objectContaining({ notify_caller: true, request_summary: "x" }));
  });

  it("does not promise an SMS when the caller withheld their number", async () => {
    const r = await reportGap({ ...base, callerNumber: null }, { request_summary: "x", notify_caller: true });
    expect(r).toContain("it'll be added");
    expect(h.insert).toHaveBeenCalledWith(expect.objectContaining({ notify_caller: false }));
  });

  it("does not promise an SMS when no SMS provider is connected", async () => {
    h.smsOn = false;
    const r = await reportGap({ ...base }, { request_summary: "x", notify_caller: true });
    expect(r).toContain("it'll be added");
    expect(h.insert).toHaveBeenCalledWith(expect.objectContaining({ notify_caller: false }));
  });

  it("never throws when the insert fails — a lost gap beats a broken call", async () => {
    h.insert.mockResolvedValueOnce({ error: { message: "boom" } });
    await expect(reportGap({ ...base }, { request_summary: "x" })).resolves.toContain("added");
  });
});
