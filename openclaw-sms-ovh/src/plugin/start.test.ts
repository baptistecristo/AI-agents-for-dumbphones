import { describe, expect, it, vi } from "vitest";

import type { OvhIncoming } from "../ovh/sms.js";
import { resolveAccount, type ResolvedOvhSmsAccount } from "./accounts.js";
import { startAccount } from "./start.js";

const configured = {
  applicationKey: "ak",
  applicationSecret: "as",
  consumerKey: "ck",
  serviceName: "sms-ab12345-1",
  virtualNumber: "+33937000000",
};

function account(overrides: Partial<ResolvedOvhSmsAccount> = {}): ResolvedOvhSmsAccount {
  return {
    ...resolveAccount({ channels: { "sms-ovh": configured } }),
    ...overrides,
  };
}

function msg(): OvhIncoming {
  return {
    id: 1,
    sender: "+33612345678",
    message: "bonjour",
    creationDatetime: new Date().toISOString(),
    credits: 1,
    tag: "",
  };
}

/** Aborted up front, so `waitUntilAbort` resolves and the test can finish. */
function abortedSignal(): AbortSignal {
  const controller = new AbortController();
  controller.abort();
  return controller.signal;
}

describe("startAccount", () => {
  it("polls and hands each message to the dispatcher", async () => {
    const dispatch = vi.fn().mockResolvedValue(undefined);
    const poll = vi.fn(async (params: { onMessage: (m: OvhIncoming) => Promise<void> }) => {
      await params.onMessage(msg());
    });

    await startAccount(
      { cfg: {}, accountId: "default", account: account(), abortSignal: abortedSignal() },
      { poll, dispatch },
    );

    expect(poll).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledOnce();
    expect(dispatch.mock.calls[0]?.[0]).toMatchObject({ message: { sender: "+33612345678" } });
  });

  it("does not poll a disabled account", async () => {
    const poll = vi.fn();
    const info = vi.fn();

    await startAccount(
      {
        cfg: {},
        accountId: "default",
        account: account({ enabled: false }),
        abortSignal: abortedSignal(),
        log: { info },
      },
      { poll },
    );

    expect(poll).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalled();
  });

  it("does not poll an unconfigured account, and says why", async () => {
    const poll = vi.fn();
    const warn = vi.fn();

    await startAccount(
      {
        cfg: {},
        accountId: "default",
        account: account({ virtualNumber: "" }),
        abortSignal: abortedSignal(),
        log: { warn },
      },
      { poll, dispatch: vi.fn() },
    );

    expect(poll).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it("waits rather than returning when there is nothing to do", async () => {
    // Returning early reads as a crash to the supervisor and earns a restart
    // loop. The honest state is "idle until the config changes".
    const controller = new AbortController();
    let settled = false;

    const started = startAccount(
      {
        cfg: {},
        accountId: "default",
        account: account({ enabled: false }),
        abortSignal: controller.signal,
      },
      { poll: vi.fn() },
    ).then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(settled).toBe(false);

    controller.abort();
    await started;
    expect(settled).toBe(true);
  });

  it("passes the account through to the dispatcher so credentials match the number", async () => {
    const dispatch = vi.fn().mockResolvedValue(undefined);
    const poll = vi.fn(async (params: { onMessage: (m: OvhIncoming) => Promise<void> }) => {
      await params.onMessage(msg());
    });
    const work = account({ accountId: "work" });

    await startAccount(
      { cfg: {}, accountId: "work", account: work, abortSignal: abortedSignal() },
      { poll, dispatch },
    );

    expect(dispatch.mock.calls[0]?.[0]).toMatchObject({ account: { accountId: "work" } });
  });
});
