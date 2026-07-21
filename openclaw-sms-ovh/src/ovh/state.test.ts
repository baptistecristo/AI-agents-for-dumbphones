import { describe, expect, it, vi } from "vitest";

import type { PluginRuntime } from "../plugin/runtime.js";
import { emptyState, type PollerState } from "./poller.js";
import { createPollerStore } from "./state.js";

function runtimeWith(store: Record<string, unknown>): PluginRuntime {
  return { state: { openKeyedStore: () => store } } as unknown as PluginRuntime;
}

const populated: PollerState = {
  seenIds: [11, 12],
  watermark: "2026-07-20T12:00:00.000Z",
};

describe("createPollerStore", () => {
  it("returns an empty state when nothing was stored", async () => {
    const store = createPollerStore({
      runtime: runtimeWith({ lookup: vi.fn().mockResolvedValue(undefined), register: vi.fn() }),
      accountId: "default",
    });

    expect(await store.load()).toEqual(emptyState());
  });

  it("reads back what was stored, so a restart does not replay the inbox", async () => {
    const store = createPollerStore({
      runtime: runtimeWith({ lookup: vi.fn().mockResolvedValue(populated), register: vi.fn() }),
      accountId: "default",
    });

    expect(await store.load()).toEqual(populated);
  });

  it("keys by account, so two numbers do not share a watermark", async () => {
    const register = vi.fn();
    const store = createPollerStore({
      runtime: runtimeWith({ lookup: vi.fn(), register }),
      accountId: "work",
    });

    await store.save(populated);

    expect(register.mock.calls[0]?.[0]).toBe("poller:work");
  });

  it("falls back to memory when the store cannot be read", async () => {
    const warn = vi.fn();
    const store = createPollerStore({
      runtime: runtimeWith({
        lookup: vi.fn().mockRejectedValue(new Error("db locked")),
        register: vi.fn(),
      }),
      accountId: "default",
      log: { warn },
    });

    await expect(store.load()).resolves.toEqual(emptyState());
    expect(warn).toHaveBeenCalled();
  });

  it("keeps the state in memory when a write fails", async () => {
    // Losing persistence costs a replay on the next restart. Throwing here
    // would cost the poll loop, which is the whole channel.
    const warn = vi.fn();
    const store = createPollerStore({
      runtime: runtimeWith({
        lookup: vi.fn().mockResolvedValue(undefined),
        register: vi.fn().mockRejectedValue(new Error("disk full")),
      }),
      accountId: "default",
      log: { warn },
    });

    await expect(store.save(populated)).resolves.toBeUndefined();
    expect(await store.load()).toEqual(populated);
    expect(warn).toHaveBeenCalled();
  });
});
