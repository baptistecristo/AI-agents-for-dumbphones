import { describe, expect, it, vi } from "vitest";

import type { OvhClient } from "../ovh/client.js";
import type { OvhIncoming } from "../ovh/sms.js";
import { resolveAccount, type ResolvedOvhSmsAccount } from "./accounts.js";
import { isSenderAllowed, runPollLoop } from "./gateway.js";

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
          allowFrom: ["+33612345678"],
        },
      },
    }),
    ...overrides,
  };
}

function msg(id: number, sender = "+33612345678"): OvhIncoming {
  return {
    id,
    sender,
    message: `message ${id}`,
    creationDatetime: new Date(T0 - 10_000).toISOString(),
    credits: 1,
    tag: "",
  };
}

function fakeClient(inbox: OvhIncoming[], failTimes = 0) {
  let failures = 0;
  const client = {
    get: async (path: string) => {
      if (failures < failTimes) {
        failures += 1;
        throw new Error("OVH unavailable");
      }
      const marker = "/incoming/";
      if (path.includes(marker)) {
        const id = Number(path.slice(path.indexOf(marker) + marker.length));
        return inbox.find((m) => m.id === id);
      }
      return inbox.map((m) => m.id);
    },
  } as unknown as OvhClient;
  return client;
}

describe("isSenderAllowed", () => {
  it("admits anyone when the policy is open", () => {
    expect(isSenderAllowed(account({ dmPolicy: "open", allowFrom: [] }), "+33699999999")).toBe(true);
  });

  it("admits a listed sender under pairing", () => {
    expect(isSenderAllowed(account(), "+33612345678")).toBe(true);
  });

  it("refuses an unlisted sender", () => {
    expect(isSenderAllowed(account(), "+33699999999")).toBe(false);
  });

  it("matches regardless of how the number is formatted", () => {
    expect(isSenderAllowed(account(), "+33 6 12 34 56 78")).toBe(true);
  });

  it("refuses everyone when the list is empty and the policy is not open", () => {
    expect(isSenderAllowed(account({ allowFrom: [] }), "+33612345678")).toBe(false);
  });
});

describe("runPollLoop", () => {
  const sleep = () => Promise.resolve();

  it("delivers inbound messages to the handler", async () => {
    const onMessage = vi.fn().mockResolvedValue(undefined);
    await runPollLoop({
      account: account(),
      onMessage,
      client: fakeClient([msg(1), msg(2)]),
      sleep,
      maxIterations: 1,
    });

    expect(onMessage).toHaveBeenCalledTimes(2);
  });

  it("ignores a message from a sender who is not allowed", async () => {
    const onMessage = vi.fn().mockResolvedValue(undefined);
    const warn = vi.fn();

    await runPollLoop({
      account: account(),
      onMessage,
      client: fakeClient([msg(1, "+33699999999")]),
      sleep,
      maxIterations: 1,
      log: { warn },
    });

    expect(onMessage).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it("does not deliver the same message twice across iterations", async () => {
    const onMessage = vi.fn().mockResolvedValue(undefined);
    await runPollLoop({
      account: account(),
      onMessage,
      client: fakeClient([msg(1)]),
      sleep,
      maxIterations: 3,
    });

    expect(onMessage).toHaveBeenCalledTimes(1);
  });

  it("keeps going when one handler throws", async () => {
    // A single malformed message must not block the ones behind it.
    const onMessage = vi
      .fn()
      .mockRejectedValueOnce(new Error("handler exploded"))
      .mockResolvedValue(undefined);
    const error = vi.fn();

    await runPollLoop({
      account: account(),
      onMessage,
      client: fakeClient([msg(1), msg(2)]),
      sleep,
      maxIterations: 1,
      log: { error },
    });

    expect(onMessage).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalled();
  });

  it("survives a failing poll and recovers on the next one", async () => {
    const onMessage = vi.fn().mockResolvedValue(undefined);
    const error = vi.fn();

    await runPollLoop({
      account: account(),
      onMessage,
      client: fakeClient([msg(1)], 1),
      sleep,
      maxIterations: 2,
      log: { error },
    });

    expect(error).toHaveBeenCalled();
    expect(onMessage).toHaveBeenCalledTimes(1);
  });

  it("stops immediately when the signal is already aborted", async () => {
    const onMessage = vi.fn();
    const controller = new AbortController();
    controller.abort();

    await runPollLoop({
      account: account(),
      onMessage,
      client: fakeClient([msg(1)]),
      sleep,
      abortSignal: controller.signal,
    });

    expect(onMessage).not.toHaveBeenCalled();
  });

  it("stops once the signal is aborted mid-run", async () => {
    const controller = new AbortController();
    const onMessage = vi.fn().mockImplementation(async () => {
      controller.abort();
    });

    await runPollLoop({
      account: account(),
      onMessage,
      client: fakeClient([msg(1), msg(2)]),
      sleep,
      abortSignal: controller.signal,
    });

    // Both messages in the current batch are delivered, then the loop exits
    // rather than sleeping and polling again.
    expect(onMessage).toHaveBeenCalledTimes(2);
  });
});
