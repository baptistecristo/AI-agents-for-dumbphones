import { describe, expect, it, vi } from "vitest";

import type { PluginRuntime } from "../plugin/runtime.js";
import type { NotificationBridge } from "./bridge.js";
import { createNotifyRouter } from "./register.js";

const runtime = {
  llm: { complete: vi.fn() },
  state: { openKeyedStore: vi.fn(() => ({ lookup: vi.fn(), register: vi.fn() })) },
} as unknown as PluginRuntime;

const CREDENTIALS = {
  applicationKey: "ak",
  applicationSecret: "as",
  consumerKey: "ck",
  serviceName: "sms-ab12345-1",
  virtualNumber: "+33937000000",
};

function cfg(notify: Record<string, unknown> | undefined) {
  return {
    channels: {
      "sms-ovh": {
        ...CREDENTIALS,
        ...(notify === undefined ? {} : { notify }),
      },
    },
  };
}

/**
 * A config with named accounts. Named accounts carry their own credentials:
 * the env fallbacks apply only to the default one.
 */
function cfgWithAccounts(
  notify: Record<string, unknown> | undefined,
  accounts: Record<string, Record<string, unknown>>,
) {
  return {
    channels: {
      "sms-ovh": {
        ...CREDENTIALS,
        ...(notify === undefined ? {} : { notify }),
        accounts,
      },
    },
  };
}

function fakeBridge() {
  const handle = vi.fn();
  const bridge = {
    handle,
    flush: vi.fn(),
    stop: vi.fn(),
    pending: () => 0,
  } as NotificationBridge;
  return { bridge, handle };
}

const event = { from: "Marie", content: "coucou" };
const context = { channelId: "whatsapp" };

describe("createNotifyRouter", () => {
  it("does nothing when notifications are switched off", () => {
    // Off by default, because every forwarded message costs the user money.
    const { bridge, handle } = fakeBridge();
    const router = createNotifyRouter({
      runtime,
      readConfig: () => cfg(undefined),
      createBridge: () => bridge,
    });

    router.handle(event, context);

    expect(handle).not.toHaveBeenCalled();
  });

  it("does nothing when enabled without a destination", () => {
    // Picking a recipient from allowFrom would be guessing who gets billed.
    const { bridge, handle } = fakeBridge();
    const router = createNotifyRouter({
      runtime,
      readConfig: () => cfg({ enabled: true }),
      createBridge: () => bridge,
    });

    router.handle(event, context);

    expect(handle).not.toHaveBeenCalled();
  });

  it("routes to the bridge once enabled and addressed", () => {
    const { bridge, handle } = fakeBridge();
    const router = createNotifyRouter({
      runtime,
      readConfig: () => cfg({ enabled: true, to: "+33612345678" }),
      createBridge: () => bridge,
    });

    router.handle(event, context);

    expect(handle).toHaveBeenCalledWith(event, context);
  });

  it("builds one bridge and reuses it, so the batch buffer survives", () => {
    const { bridge } = fakeBridge();
    const createBridge = vi.fn(() => bridge);
    const router = createNotifyRouter({
      runtime,
      readConfig: () => cfg({ enabled: true, to: "+33612345678" }),
      createBridge,
    });

    router.handle(event, context);
    router.handle(event, context);

    expect(createBridge).toHaveBeenCalledOnce();
    expect(router.bridges.size).toBe(1);
  });

  it("picks up a config change without a restart", () => {
    // Registration happens once at load, so the account is read per event.
    const { bridge, handle } = fakeBridge();
    let notify: Record<string, unknown> | undefined;
    const router = createNotifyRouter({
      runtime,
      readConfig: () => cfg(notify),
      createBridge: () => bridge,
    });

    router.handle(event, context);
    expect(handle).not.toHaveBeenCalled();

    notify = { enabled: true, to: "+33612345678" };
    router.handle(event, context);

    expect(handle).toHaveBeenCalledOnce();
  });

  it("gives a named account its own bridge", () => {
    // `channels.sms-ovh.accounts.<name>.notify` parses and validates, so it
    // has to route as well. Resolving only the default account made it config
    // that silently did nothing.
    const { bridge, handle } = fakeBridge();
    const createBridge = vi.fn(() => bridge);
    const router = createNotifyRouter({
      runtime,
      readConfig: () =>
        cfgWithAccounts(undefined, {
          work: { ...CREDENTIALS, notify: { enabled: true, to: "+33612345678" } },
        }),
      createBridge,
    });

    router.handle(event, context);

    expect(handle).toHaveBeenCalledWith(event, context);
    expect(router.bridges.has("work")).toBe(true);
    expect(createBridge.mock.calls[0]?.[0]?.account.accountId).toBe("work");
  });

  it("does not build a bridge for a named account that has not asked for one", () => {
    const { bridge } = fakeBridge();
    const createBridge = vi.fn(() => bridge);
    const router = createNotifyRouter({
      runtime,
      readConfig: () =>
        cfgWithAccounts({ enabled: true, to: "+33612345678" }, {
          work: { ...CREDENTIALS },
        }),
      createBridge,
    });

    router.handle(event, context);

    expect(router.bridges.has("default")).toBe(true);
    expect(router.bridges.has("work")).toBe(false);
  });

  it("gives each account its own spend state, so two numbers cannot spend each other's budget", async () => {
    const register = vi.fn();
    const keyed = { lookup: vi.fn().mockResolvedValue(undefined), register };
    const multiRuntime = {
      llm: { complete: vi.fn() },
      state: { openKeyedStore: vi.fn(() => keyed) },
    } as unknown as PluginRuntime;

    const { bridge } = fakeBridge();
    const createBridge = vi.fn(() => bridge);
    const router = createNotifyRouter({
      runtime: multiRuntime,
      readConfig: () =>
        cfgWithAccounts({ enabled: true, to: "+33612345678" }, {
          work: { ...CREDENTIALS, notify: { enabled: true, to: "+33698765432" } },
        }),
      createBridge,
    });

    router.handle(event, context);

    expect(router.bridges.size).toBe(2);

    // The stores handed to the two bridges write under different keys, which
    // is what keeps one number's budget out of the other's.
    for (const call of createBridge.mock.calls) {
      await call[0]?.store.save({ sends: [] });
    }
    expect(register.mock.calls.map((call) => call[0])).toEqual([
      "rate-limit:default",
      "rate-limit:work",
    ]);
  });

  it("swallows a broken config rather than throwing into the hook", () => {
    const error = vi.fn();
    const router = createNotifyRouter({
      runtime,
      readConfig: () => {
        throw new Error("config unreadable");
      },
      log: { error },
    });

    expect(() => router.handle(event, context)).not.toThrow();
    expect(error).toHaveBeenCalled();
  });
});
