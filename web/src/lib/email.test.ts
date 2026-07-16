import { afterEach, describe, expect, it, vi } from "vitest";
import { sendEmail } from "./email";

const OLD = { ...process.env };
afterEach(() => {
  process.env = { ...OLD };
  vi.unstubAllGlobals();
});

function ok() {
  return { ok: true, status: 200, text: async () => "{}" };
}
function fail(status: number) {
  return { ok: false, status, text: async () => "bad" };
}

describe("sendEmail", () => {
  it("POSTs to Resend with the configured from/to/subject", async () => {
    process.env.RESEND_API_KEY = "k";
    process.env.REPORT_EMAIL_FROM = "from@x.dev";
    process.env.REPORT_EMAIL_TO = "to@x.dev";
    const fetchMock = vi.fn().mockResolvedValue(ok());
    vi.stubGlobal("fetch", fetchMock);

    await sendEmail({ subject: "s", text: "t" });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer k");
    expect(JSON.parse(init.body)).toMatchObject({ from: "from@x.dev", to: "to@x.dev", subject: "s", text: "t" });
  });

  it("throws on a non-2xx response so the cron can retry", async () => {
    process.env.RESEND_API_KEY = "k";
    process.env.REPORT_EMAIL_FROM = "from@x.dev";
    process.env.REPORT_EMAIL_TO = "to@x.dev";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fail(422)));
    await expect(sendEmail({ subject: "s", text: "t" })).rejects.toThrow("Resend 422");
  });
});
