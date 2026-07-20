import { describe, expect, it, vi } from "vitest";

import type { OvhIncoming } from "../ovh/sms.js";
import { resolveAccount, type ResolvedOvhSmsAccount } from "./accounts.js";
import { createSmsDelivery, dispatchInboundSms, inboundTimestamp } from "./inbound.js";
import type { PluginRuntime } from "./runtime.js";
import type { SendTextResult } from "./send.js";

const T0 = Date.parse("2026-07-20T12:00:00.000Z");

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

function msg(overrides: Partial<OvhIncoming> = {}): OvhIncoming {
  return {
    id: 42,
    sender: "+33612345678",
    message: "quelle heure est-il",
    creationDatetime: new Date(T0).toISOString(),
    credits: 1,
    tag: "",
    ...overrides,
  };
}

/** Records what was sent, and reports the segment count the caller asked for. */
function recordingSend() {
  const sent: string[] = [];
  const send = vi.fn(async (params: { text: string }): Promise<SendTextResult> => {
    sent.push(params.text);
    // One segment per 153 characters, which is what the real send path bills.
    const segments = Math.max(1, Math.ceil(params.text.length / 153));
    return {
      reports: [{ ids: [1], validReceivers: [], invalidReceivers: [], totalCreditsRemoved: 2 }],
      parts: [params.text],
      segments,
    };
  });
  return { send, sent };
}

/**
 * A runtime that drives the adapter the way OpenClaw does: ingest the raw
 * message, resolve the turn, then hand replies to the delivery adapter. A stub
 * that merely recorded the call would not catch a broken adapter.
 */
function fakeRuntime(replies: string[] = []) {
  const buildContext = vi.fn((params: unknown) => ({ ...(params as object), built: true }));
  const resolveAgentRoute = vi.fn(() => ({
    agentId: "main",
    channel: "sms-ovh",
    accountId: "default",
    sessionKey: "agent:main:sms-ovh:+33612345678",
    mainSessionKey: "agent:main",
    lastRoutePolicy: "session" as const,
    matchedBy: "default" as const,
  }));

  let turn: Record<string, unknown> | undefined;

  const run = vi.fn(async (params: Record<string, unknown>) => {
    const adapter = params["adapter"] as {
      ingest: (raw: unknown) => unknown;
      resolveTurn: (input: unknown) => Record<string, unknown>;
    };
    const input = adapter.ingest(params["raw"]);
    turn = adapter.resolveTurn(input);

    const delivery = turn["delivery"] as {
      deliver: (payload: { text: string }) => Promise<{ visibleReplySent: boolean }>;
    };
    for (const text of replies) await delivery.deliver({ text });
    return turn;
  });

  const runtime = {
    channel: {
      routing: { resolveAgentRoute },
      session: {
        resolveStorePath: vi.fn(() => "/tmp/sessions"),
        recordInboundSession: vi.fn(),
      },
      reply: { dispatchReplyWithBufferedBlockDispatcher: vi.fn() },
      inbound: { buildContext, run },
    },
  } as unknown as PluginRuntime;

  return { runtime, buildContext, resolveAgentRoute, run, getTurn: () => turn };
}

describe("inboundTimestamp", () => {
  it("parses an ISO timestamp", () => {
    expect(inboundTimestamp("2026-07-20T12:00:00.000Z")).toBe(T0);
  });

  it("returns undefined for a malformed one rather than NaN", () => {
    // NaN would travel into the turn and corrupt ordering downstream.
    expect(inboundTimestamp("not a date")).toBeUndefined();
  });
});

describe("dispatchInboundSms", () => {
  it("routes on the sender's number", async () => {
    const { runtime, resolveAgentRoute } = fakeRuntime();
    const { send } = recordingSend();

    await dispatchInboundSms({ cfg: {}, account: account(), message: msg(), runtime, send });

    expect(resolveAgentRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "sms-ovh",
        peer: { kind: "direct", id: "+33612345678" },
      }),
    );
  });

  it("gives the same session key to two messages from one phone", async () => {
    const { runtime, buildContext } = fakeRuntime();
    const { send } = recordingSend();

    await dispatchInboundSms({ cfg: {}, account: account(), message: msg({ id: 1 }), runtime, send });
    await dispatchInboundSms({ cfg: {}, account: account(), message: msg({ id: 2 }), runtime, send });

    const [first, second] = buildContext.mock.calls.map(
      (call) => (call[0] as { route: { routeSessionKey: string } }).route.routeSessionKey,
    );
    expect(first).toBe(second);
  });

  it("carries the message body through to the agent", async () => {
    const { runtime, buildContext } = fakeRuntime();
    const { send } = recordingSend();

    await dispatchInboundSms({
      cfg: {},
      account: account(),
      message: msg({ message: "rappelle-moi le rendez-vous" }),
      runtime,
      send,
    });

    const built = buildContext.mock.calls[0]?.[0] as {
      message: { rawBody: string; bodyForAgent?: string };
    };
    expect(built.message.rawBody).toBe("rappelle-moi le rendez-vous");
    expect(built.message.bodyForAgent).toBe("rappelle-moi le rendez-vous");
  });

  it("scopes the turn id by account, since OVH ids are only unique per service", async () => {
    const { runtime, getTurn } = fakeRuntime();
    const { send } = recordingSend();

    await dispatchInboundSms({
      cfg: {},
      account: account({ accountId: "work" }),
      message: msg({ id: 7 }),
      runtime,
      send,
    });

    expect(getTurn()?.["messageId"]).toBe("7");
  });

  it("omits the timestamp entirely when OVH sends a malformed one", async () => {
    const { runtime, buildContext } = fakeRuntime();
    const { send } = recordingSend();

    await dispatchInboundSms({
      cfg: {},
      account: account(),
      message: msg({ creationDatetime: "yesterday" }),
      runtime,
      send,
    });

    expect(buildContext.mock.calls[0]?.[0]).not.toHaveProperty("timestamp");
  });

  it("sends the agent's reply back to the sender", async () => {
    const { runtime } = fakeRuntime(["il est midi"]);
    const { send, sent } = recordingSend();

    await dispatchInboundSms({ cfg: {}, account: account(), message: msg(), runtime, send });

    expect(sent).toEqual(["il est midi"]);
    expect(send.mock.calls[0]?.[0]).toMatchObject({ to: "+33612345678" });
  });
});

describe("createSmsDelivery", () => {
  it("sends a short reply unchanged", async () => {
    const { send, sent } = recordingSend();
    const delivery = createSmsDelivery({ account: account(), to: "+33612345678", send });

    const result = await delivery.deliver({ text: "ok" });

    expect(sent).toEqual(["ok"]);
    expect(result.visibleReplySent).toBe(true);
  });

  it("sends nothing for an empty payload", async () => {
    const { send, sent } = recordingSend();
    const delivery = createSmsDelivery({ account: account(), to: "+33612345678", send });

    const result = await delivery.deliver({ text: "   " });

    expect(sent).toEqual([]);
    expect(result.visibleReplySent).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("cuts a reply that would exceed the segment budget", async () => {
    const { send, sent } = recordingSend();
    const delivery = createSmsDelivery({
      account: account({ maxReplySegments: 1 }),
      to: "+33612345678",
      send,
    });

    await delivery.deliver({ text: "mot ".repeat(200).trim() });

    expect(sent[0]?.length).toBeLessThanOrEqual(160);
    expect(sent[0]?.endsWith("[...]")).toBe(true);
  });

  it("spends the budget across a whole turn, not per call", async () => {
    // The reply pipeline delivers block by block. A budget that reset on each
    // call would cap nothing at all.
    const { send, sent } = recordingSend();
    const delivery = createSmsDelivery({
      account: account({ maxReplySegments: 2 }),
      to: "+33612345678",
      send,
    });

    await delivery.deliver({ text: "a".repeat(153) });
    await delivery.deliver({ text: "b".repeat(153) });
    const third = await delivery.deliver({ text: "c".repeat(153) });

    expect(sent).toHaveLength(2);
    expect(third.visibleReplySent).toBe(false);
  });

  it("warns when it drops the tail of a turn", async () => {
    const { send } = recordingSend();
    const warn = vi.fn();
    const delivery = createSmsDelivery({
      account: account({ maxReplySegments: 1 }),
      to: "+33612345678",
      send,
      log: { warn },
    });

    await delivery.deliver({ text: "a".repeat(153) });
    await delivery.deliver({ text: "more" });

    expect(warn).toHaveBeenCalled();
  });

  it("reports the OVH job ids so the host can track delivery", async () => {
    const { send } = recordingSend();
    const delivery = createSmsDelivery({ account: account(), to: "+33612345678", send });

    const result = await delivery.deliver({ text: "ok" });

    expect(result.messageIds).toEqual(["1"]);
  });

  it("gives a fresh budget to each turn", async () => {
    const { send, sent } = recordingSend();
    const build = () =>
      createSmsDelivery({ account: account({ maxReplySegments: 1 }), to: "+33612345678", send });

    await build().deliver({ text: "a".repeat(153) });
    await build().deliver({ text: "b".repeat(153) });

    expect(sent).toHaveLength(2);
  });
});
