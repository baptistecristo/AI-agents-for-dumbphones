import { describe, expect, it, vi } from "vitest";

import type { PluginRuntime } from "../plugin/runtime.js";
import type { NotificationBridge } from "./bridge.js";
import { createNotifyRouter } from "./register.js";

const runtime = {
  llm: { complete: vi.fn() },
  state: { openKeyedStore: vi.fn(() => ({ lookup: vi.fn(), register: vi.fn() })) },
} as unknown as PluginRuntime;

function cfg(notify: Record<string, unknown> | undefined) {
  return {
    channels: {
      "sms-ovh": {
        applicationKey: "ak",
        applicationSecret: "as",
        consumerKey: "ck",
        serviceName: "sms-ab12345-1",
        virtualNumber: "+33937000000",
        ...(notify === undefined ? {} : { notify }),
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
