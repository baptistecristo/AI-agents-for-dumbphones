import { describe, expect, it, vi } from "vitest";

import {
  emptyRateLimitState,
  type RateLimitConfig,
  type RateLimitState,
} from "../filter/rate-limit.js";
import type { FilterConfig } from "../filter/rules.js";
import { resolveAccount, type ResolvedOvhSmsAccount } from "../plugin/accounts.js";
import type { SendTextResult } from "../plugin/send.js";
import {
  createNotificationBridge,
  shouldBridge,
  toNotification,
  type InboundHookContext,
  type InboundHookEvent,
} from "./bridge.js";
import type { SpendStore } from "./state.js";

function account(notify: Record<string, unknown> = {}): ResolvedOvhSmsAccount {
  return resolveAccount({
    channels: {
      "sms-ovh": {
        applicationKey: "ak",
        applicationSecret: "as",
        consumerKey: "ck",
        serviceName: "sms-ab12345-1",
        virtualNumber: "+33937000000",
        notify: { enabled: true, to: "+33612345678", ...notify },
      },
    },
  });
}

/** Everything reaches the classifier, so the fake model decides the outcome. */
const ALWAYS_ASK: FilterConfig = {
  global: { unknown_apps: "llm", rules: [] },
  apps: {},
};

const FORWARD_EVERYTHING: FilterConfig = {
  global: { unknown_apps: "send", rules: [] },
  apps: {},
};

/**
 * Spend controls turned off, for tests about batching rather than about spend.
 * With the real defaults a 30 second cooldown stops the second message in a
 * batch, which is correct behaviour and would mask what these tests check.
 */
const NO_LIMITS: RateLimitConfig = {
  cooldownSeconds: 0,
  perSenderHourly: 1000,
  dedupeSeconds: 0,
  softDailyBudget: 1000,
  hardDailyBudget: 1000,
};

function memoryStore(initial: RateLimitState = emptyRateLimitState()) {
  let state = initial;
  const store: SpendStore = {
    load: async () => state,
    save: async (next) => {
      state = next;
    },
  };
  return { store, read: () => state };
}

function recordingSend() {
  const sent: string[] = [];
  const send = vi.fn(async (params: { text: string }): Promise<SendTextResult> => {
    sent.push(params.text);
    return { reports: [], parts: [params.text], segments: 1 };
  });
  return { send, sent };
}

function evt(overrides: Partial<InboundHookEvent> = {}): InboundHookEvent {
  return { from: "Marie", content: "on se voit a 18h", ...overrides };
}

function ctx(overrides: Partial<InboundHookContext> = {}): InboundHookContext {
  return { channelId: "whatsapp", ...overrides };
}

describe("shouldBridge", () => {
  it("refuses our own channel, or the bridge bills every lap of a loop", () => {
    // An SMS the user sends arrives as inbound. Forwarding it back to them
    // would be a paid infinite loop.
    expect(shouldBridge(account(), ctx({ channelId: "sms-ovh" }))).toBe(false);
  });

  it("admits any other channel when no allow-list is set", () => {
    expect(shouldBridge(account(), ctx({ channelId: "whatsapp" }))).toBe(true);
    expect(shouldBridge(account(), ctx({ channelId: "telegram" }))).toBe(true);
  });

  it("honours an explicit channel allow-list", () => {
    const only = account({ fromChannels: ["signal"] });
    expect(shouldBridge(only, ctx({ channelId: "signal" }))).toBe(true);
    expect(shouldBridge(only, ctx({ channelId: "whatsapp" }))).toBe(false);
  });

  it("still refuses our own channel even if someone lists it", () => {
    const silly = account({ fromChannels: ["sms-ovh"] });
    expect(shouldBridge(silly, ctx({ channelId: "sms-ovh" }))).toBe(false);
  });
});

describe("toNotification", () => {
  it("uses the channel id as the app and the sender as the title", () => {
    expect(toNotification(evt(), ctx())).toMatchObject({
      app: "whatsapp",
      title: "Marie",
      body: "on se voit a 18h",
    });
  });

  it("leaves the group field unset for a direct message", () => {
    // The urgency stage reads a present `channel` as "this is a group", so
    // setting it for direct messages would mislabel every message.
    expect(toNotification(evt(), ctx())).not.toHaveProperty("channel");
  });

  it("sets the group field when the conversation is not the sender", () => {
    const n = toNotification(
      evt({ senderId: "u1" }),
      ctx({ conversationId: "Familles Vacances" }),
    );
    expect(n.channel).toBe("Familles Vacances");
  });

  it("does not treat a conversation equal to the sender as a group", () => {
    const n = toNotification(evt({ senderId: "u1" }), ctx({ conversationId: "u1" }));
    expect(n).not.toHaveProperty("channel");
  });

  it("falls back to the sender id when the display name is blank", () => {
    expect(toNotification(evt({ from: "  ", senderId: "u42" }), ctx()).title).toBe("u42");
  });
});

describe("createNotificationBridge", () => {
  const never = vi.fn(() => () => undefined);

  it("holds messages rather than filtering each one alone", async () => {
    // The urgency stage costs one model call per batch, so batching is the
    // difference between one call and ten.
    const { store } = memoryStore();
    const { send } = recordingSend();
    const bridge = createNotificationBridge({
      account: account(),
      model: async () => "SEND",
      store,
      config: FORWARD_EVERYTHING,
      send,
      schedule: never,
    });

    bridge.handle(evt(), ctx());
    bridge.handle(evt(), ctx());

    expect(bridge.pending()).toBe(2);
    expect(send).not.toHaveBeenCalled();
  });

  it("flushes early once the batch is full", async () => {
    const { store } = memoryStore();
    const { send, sent } = recordingSend();
    const bridge = createNotificationBridge({
      account: account({ maxBatch: 2 }),
      model: async () => "SEND",
      store,
      config: FORWARD_EVERYTHING,
      send,
      schedule: never,
      limits: NO_LIMITS,
    });

    bridge.handle(evt({ content: "un" }), ctx());
    bridge.handle(evt({ content: "deux" }), ctx());
    await bridge.flush();

    expect(sent).toHaveLength(2);
  });

  it("flushes when the timer fires", async () => {
    const { store } = memoryStore();
    const { send, sent } = recordingSend();
    let fire: (() => void) | undefined;

    const bridge = createNotificationBridge({
      account: account(),
      model: async () => "SEND",
      store,
      config: FORWARD_EVERYTHING,
      send,
      schedule: (run) => {
        fire = run;
        return () => undefined;
      },
    });

    bridge.handle(evt(), ctx());
    expect(sent).toHaveLength(0);

    fire?.();
    await bridge.flush();

    expect(sent).toHaveLength(1);
  });

  it("sends only what survives the filter", async () => {
    const { store } = memoryStore();
    const { send, sent } = recordingSend();
    const bridge = createNotificationBridge({
      account: account(),
      model: async (prompt) => (prompt.includes("urgent") ? "NO" : "DROP"),
      store,
      config: ALWAYS_ASK,
      send,
      schedule: never,
    });

    bridge.handle(evt(), ctx());
    await bridge.flush();

    expect(sent).toEqual([]);
  });

  it("does not bridge our own channel", async () => {
    const { store } = memoryStore();
    const { send } = recordingSend();
    const bridge = createNotificationBridge({
      account: account(),
      model: async () => "SEND",
      store,
      config: FORWARD_EVERYTHING,
      send,
      schedule: never,
    });

    bridge.handle(evt(), ctx({ channelId: "sms-ovh" }));
    await bridge.flush();

    expect(send).not.toHaveBeenCalled();
    expect(bridge.pending()).toBe(0);
  });

  it("carries spend state forward between batches", async () => {
    // Without this the daily budget resets every batch and caps nothing.
    const { store, read } = memoryStore();
    const { send } = recordingSend();
    const bridge = createNotificationBridge({
      account: account(),
      model: async () => "SEND",
      store,
      config: FORWARD_EVERYTHING,
      send,
      schedule: never,
      limits: NO_LIMITS,
    });

    bridge.handle(evt({ content: "un" }), ctx());
    await bridge.flush();
    expect(read().sends.length).toBeGreaterThan(0);

    const afterFirst = read().sends.length;
    bridge.handle(evt({ content: "deux" }), ctx({ channelId: "telegram" }));
    await bridge.flush();

    expect(read().sends.length).toBeGreaterThan(afterFirst);
  });

  it("keeps going when one send fails", async () => {
    const { store } = memoryStore();
    const error = vi.fn();
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error("OVH down"))
      .mockResolvedValue({ reports: [], parts: ["x"], segments: 1 });

    const bridge = createNotificationBridge({
      account: account(),
      model: async () => "SEND",
      store,
      config: FORWARD_EVERYTHING,
      send,
      schedule: never,
      limits: NO_LIMITS,
      log: { error },
    });

    bridge.handle(evt({ from: "A", content: "un" }), ctx());
    bridge.handle(evt({ from: "B", content: "deux" }), ctx());
    await bridge.flush();

    expect(send).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalled();
  });

  it("never throws out of the hook, whatever the store does", async () => {
    const exploding: SpendStore = {
      load: async () => {
        throw new Error("store gone");
      },
      save: async () => undefined,
    };
    const bridge = createNotificationBridge({
      account: account(),
      model: async () => "SEND",
      store: exploding,
      config: FORWARD_EVERYTHING,
      send: recordingSend().send,
      schedule: never,
    });

    expect(() => bridge.handle(evt(), ctx())).not.toThrow();
    await expect(bridge.flush()).resolves.toBeUndefined();
  });

  it("sends nothing when there is nothing gathered", async () => {
    const { store } = memoryStore();
    const { send } = recordingSend();
    const bridge = createNotificationBridge({
      account: account(),
      model: async () => "SEND",
      store,
      config: FORWARD_EVERYTHING,
      send,
      schedule: never,
    });

    await bridge.flush();
    expect(send).not.toHaveBeenCalled();
  });
});

describe("the spend controls", () => {
  const never = vi.fn(() => () => undefined);

  it("applies the cooldown by default, so a burst does not become a burst of SMS", async () => {
    // Ten messages arriving together is exactly the case that makes a metered
    // channel unaffordable, so only the first gets through.
    const { store } = memoryStore();
    const { send, sent } = recordingSend();
    const bridge = createNotificationBridge({
      account: account(),
      model: async () => "SEND",
      store,
      config: FORWARD_EVERYTHING,
      send,
      schedule: never,
    });

    for (const n of [1, 2, 3]) bridge.handle(evt({ content: `message ${n}` }), ctx());
    await bridge.flush();

    expect(sent).toHaveLength(1);
  });

  it("takes the cooldown from config, so the user can loosen it", async () => {
    const { store } = memoryStore();
    const { send, sent } = recordingSend();
    const bridge = createNotificationBridge({
      account: account({ limits: { cooldownSeconds: 0, dedupeSeconds: 0 } }),
      model: async () => "SEND",
      store,
      config: FORWARD_EVERYTHING,
      send,
      schedule: never,
    });

    bridge.handle(evt({ content: "un" }), ctx());
    bridge.handle(evt({ content: "deux" }), ctx());
    await bridge.flush();

    expect(sent).toHaveLength(2);
  });

  it("stops entirely once the hard daily budget is gone", async () => {
    const { store } = memoryStore();
    const { send, sent } = recordingSend();
    const bridge = createNotificationBridge({
      account: account({
        limits: { cooldownSeconds: 0, dedupeSeconds: 0, hardDailyBudget: 0 },
      }),
      model: async () => "SEND",
      store,
      config: FORWARD_EVERYTHING,
      send,
      schedule: never,
    });

    bridge.handle(evt({ content: "un" }), ctx());
    await bridge.flush();

    expect(sent).toHaveLength(0);
  });
});
