import { describe, expect, it, vi } from "vitest";

import type { OvhClient } from "../ovh/client.js";
import { emptyState, type PollerState } from "../ovh/poller.js";
import type { PollerStore } from "../ovh/state.js";
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

/** Stands in for the keyed store, which is exercised in `ovh/state.test.ts`. */
function memoryStore(initial?: PollerState) {
  let saved = initial;
  return {
    store: {
      load: () => Promise.resolve(saved ?? emptyState()),
      save: (state: PollerState) => {
        saved = state;
        return Promise.resolve();
      },
    } satisfies PollerStore,
    current: () => saved,
  };
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

  it("does not write the rejected sender's number to the log", async () => {
    // A rejected message still deserves a log line, but a log file is not the
    // place for someone's phone number.
    const warn = vi.fn();

    await runPollLoop({
      account: account(),
      onMessage: vi.fn().mockResolvedValue(undefined),
      client: fakeClient([msg(1, "+33699999999")]),
      sleep,
      maxIterations: 1,
      log: { warn },
    });

    const line = String(warn.mock.calls[0]?.[0] ?? "");
    expect(line).not.toContain("+33699999999");
    expect(line).not.toContain("699999");
    // Still says enough to recognise which sender was refused.
    expect(line).toContain("*");
    expect(line).toContain("99");
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

  it("does not re-deliver messages after a restart", async () => {
    // `openclaw gateway restart` with in-memory state re-lists the cold-start
    // window and answers every message in it again, billing the user twice for
    // an answer they already had.
    const inbox = [msg(1), msg(2)];
    const store = memoryStore();

    const first = vi.fn().mockResolvedValue(undefined);
    await runPollLoop({
      account: account(),
      onMessage: first,
      client: fakeClient(inbox),
      sleep,
      maxIterations: 1,
      store: store.store,
    });
    expect(first).toHaveBeenCalledTimes(2);

    // A fresh loop over the same inbox, as if the gateway had been restarted.
    const second = vi.fn().mockResolvedValue(undefined);
    await runPollLoop({
      account: account(),
      onMessage: second,
      client: fakeClient(inbox),
      sleep,
      maxIterations: 1,
      store: store.store,
    });

    expect(second).not.toHaveBeenCalled();
  });

  it("replays the cold-start window when there is no store", async () => {
    // The counterpart to the test above: without persistence the second run
    // cold-starts and hands the same messages over again.
    const inbox = [msg(1)];

    const first = vi.fn().mockResolvedValue(undefined);
    await runPollLoop({
      account: account(),
      onMessage: first,
      client: fakeClient(inbox),
      sleep,
      maxIterations: 1,
    });

    const second = vi.fn().mockResolvedValue(undefined);
    await runPollLoop({
      account: account(),
      onMessage: second,
      client: fakeClient(inbox),
      sleep,
      maxIterations: 1,
    });

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("saves the state after every poll, not only at the end", async () => {
    const store = memoryStore();

    await runPollLoop({
      account: account(),
      onMessage: vi.fn().mockResolvedValue(undefined),
      client: fakeClient([msg(1)]),
      sleep,
      maxIterations: 1,
      store: store.store,
    });

    expect(store.current()?.seenIds).toContain(1);
    expect(store.current()?.watermark).toBeDefined();
  });

  it("keeps polling when the stored state cannot be read", async () => {
    // Degrading to a cold start costs one replay. Throwing would cost the
    // channel.
    const onMessage = vi.fn().mockResolvedValue(undefined);
    const error = vi.fn();
    const broken: PollerStore = {
      load: () => Promise.reject(new Error("db locked")),
      save: () => Promise.resolve(),
    };

    await runPollLoop({
      account: account(),
      onMessage,
      client: fakeClient([msg(1)]),
      sleep,
      maxIterations: 1,
      store: broken,
      log: { error },
    });

    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalled();
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
