import { describe, expect, it, vi } from "vitest";

import type { OvhClient } from "../ovh/client.js";
import { resolveAccount, type ResolvedOvhSmsAccount } from "./accounts.js";
import { sendText, toPlainText } from "./send.js";

function account(overrides: Partial<ResolvedOvhSmsAccount> = {}): ResolvedOvhSmsAccount {
  return {
    ...resolveAccount({
      channels: {
        "sms-ovh": {
          applicationKey: "ak",
          applicationSecret: "as",
          consumerKey: "ck",
          serviceName: "sms-ab12345-1",
          virtualNumber: "+33937000000",
        },
      },
    }),
    ...overrides,
  };
}

/** Records the message bodies posted to OVH. */
function fakeClient() {
  const sent: string[] = [];
  let nextId = 1;
  const client = {
    post: async (_path: string, body: unknown) => {
      sent.push((body as { message: string }).message);
      return { ids: [nextId++], validReceivers: ["+33612345678"], invalidReceivers: [], totalCreditsRemoved: 2 };
    },
  } as unknown as OvhClient;
  return { client, sent };
}

describe("toPlainText", () => {
  it("unwraps bold and italic", () => {
    expect(toPlainText("**bold** and *italic*")).toBe("bold and italic");
  });

  it("keeps both the label and the URL of a link", () => {
    // A label alone is useless on a phone with no way to tap it.
    expect(toPlainText("[the docs](https://example.com)")).toBe("the docs https://example.com");
  });

  it("removes heading markers", () => {
    expect(toPlainText("## Today")).toBe("Today");
  });

  it("unwraps inline and fenced code", () => {
    expect(toPlainText("run `npm test`")).toBe("run npm test");
    expect(toPlainText("```js\nconst a = 1;\n```")).toBe("const a = 1;");
  });

  it("normalises list markers and blockquotes", () => {
    expect(toPlainText("* one\n* two")).toBe("- one\n- two");
    expect(toPlainText("> quoted")).toBe("quoted");
  });

  it("collapses runs of blank lines", () => {
    expect(toPlainText("a\n\n\n\nb")).toBe("a\n\nb");
  });
});

describe("sendText", () => {
  it("sends a short reply as a single message", async () => {
    const { client, sent } = fakeClient();
    const result = await sendText({ account: account(), to: "+33612345678", text: "ok", client });

    expect(sent).toEqual(["ok"]);
    expect(result.segments).toBe(1);
  });

  it("splits a long reply at the configured chunk limit", async () => {
    const { client, sent } = fakeClient();
    const text = "mot ".repeat(120).trim();

    await sendText({ account: account(), to: "+33612345678", text, client });

    expect(sent.length).toBeGreaterThan(1);
    for (const part of sent) expect(part.length).toBeLessThanOrEqual(153);
  });

  it("sends parts in order, because SMS does not guarantee ordering", async () => {
    const { client, sent } = fakeClient();
    const text = `${"a".repeat(150)} ${"b".repeat(150)}`;

    await sendText({ account: account(), to: "+33612345678", text, client });

    expect(sent[0]?.startsWith("a")).toBe(true);
    expect(sent[1]?.startsWith("b")).toBe(true);
  });

  it("strips markdown before sending", async () => {
    const { client, sent } = fakeClient();
    await sendText({ account: account(), to: "+33612345678", text: "**important**", client });
    expect(sent).toEqual(["important"]);
  });

  it("leaves accents alone by default", async () => {
    const { client, sent } = fakeClient();
    await sendText({ account: account(), to: "+33612345678", text: "vous êtes prêt", client });
    expect(sent).toEqual(["vous êtes prêt"]);
  });

  it("rewrites accents to GSM-7 when asked, halving the segment count", async () => {
    const { client, sent } = fakeClient();
    const result = await sendText({
      account: account(),
      to: "+33612345678",
      text: "vous êtes prêt",
      forceGsm7: true,
      client,
    });

    expect(sent).toEqual(["vous etes pret"]);
    expect(result.segments).toBe(1);
  });

  it("sends nothing for empty text", async () => {
    const { client, sent } = fakeClient();
    const result = await sendText({ account: account(), to: "+33612345678", text: "  ", client });

    expect(sent).toEqual([]);
    expect(result.segments).toBe(0);
  });

  it("refuses a part that would exceed OVH's six-segment ceiling", async () => {
    const { client } = fakeClient();
    // A chunk limit above the concatenation ceiling is a misconfiguration.
    await expect(
      sendText({
        account: account({ textChunkLimit: 2000 }),
        to: "+33612345678",
        text: "a".repeat(1800),
        client,
      }),
    ).rejects.toThrowError(/six|6 segments|limit of 6/i);
  });

  it("counts total segments across every part", async () => {
    const { client } = fakeClient();
    const result = await sendText({
      account: account(),
      to: "+33612345678",
      text: `${"a".repeat(150)} ${"b".repeat(150)}`,
      client,
    });

    expect(result.parts).toHaveLength(2);
    expect(result.segments).toBe(2);
  });

  it("does not call OVH at all when there is nothing to send", async () => {
    const post = vi.fn();
    const client = { post } as unknown as OvhClient;
    await sendText({ account: account(), to: "+33612345678", text: "", client });
    expect(post).not.toHaveBeenCalled();
  });
});
