import { describe, expect, it, vi } from "vitest";

// The route pulls in supabase/email/twilio at import; stub them so importing the
// module never touches a network or real client. The auth guard returns before
// any of them is called.
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => ({}) }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/twilio", () => ({ sendSms: vi.fn() }));

import { GET } from "./route";

describe("cron/reports auth", () => {
  it("rejects a request without the cron secret", async () => {
    const res = await GET(new Request("http://localhost/api/cron/reports"));
    expect(res.status).toBe(401);
  });
});
