import { describe, expect, it, vi } from "vitest";

import { emptyRateLimitState } from "../filter/rate-limit.js";
import type { PluginRuntime } from "../plugin/runtime.js";
import { createSpendStore } from "./state.js";

function runtimeWith(store: Record<string, unknown>): PluginRuntime {
  return { state: { openKeyedStore: () => store } } as unknown as PluginRuntime;
}

const populated = { sends: [{ at: 1, cost: 0.12, app: "whatsapp", sender: "M", fingerprint: "f" }] };

describe("createSpendStore", () => {
  it("returns an empty state when nothing was stored", async () => {
    const store = createSpendStore({
      runtime: runtimeWith({ lookup: vi.fn().mockResolvedValue(undefined), register: vi.fn() }),
      accountId: "default",
    });

    expect(await store.load()).toEqual(emptyRateLimitState());
  });

  it("reads back what was stored, so a restart does not reset the budget", async () => {
    // In-memory state means a gateway restarted twice in an evening grants
    // itself three daily budgets.
    const store = createSpendStore({
      runtime: runtimeWith({ lookup: vi.fn().mockResolvedValue(populated), register: vi.fn() }),
      accountId: "default",
    });

    expect(await store.load()).toEqual(populated);
  });

  it("keys by account, so two numbers cannot spend each other's budget", async () => {
    const register = vi.fn();
    const store = createSpendStore({
      runtime: runtimeWith({ lookup: vi.fn(), register }),
      accountId: "work",
    });

    await store.save(populated);

    expect(register.mock.calls[0]?.[0]).toBe("rate-limit:work");
  });

  it("falls back to memory when the store cannot be read", async () => {
    const warn = vi.fn();
    const store = createSpendStore({
      runtime: runtimeWith({
        lookup: vi.fn().mockRejectedValue(new Error("db locked")),
        register: vi.fn(),
      }),
      accountId: "default",
      log: { warn },
    });

    await expect(store.load()).resolves.toEqual(emptyRateLimitState());
    expect(warn).toHaveBeenCalled();
  });

  it("keeps the state in memory when a write fails", async () => {
    // Losing persistence costs a budget reset on restart. Throwing here would
    // cost the notification itself.
    const warn = vi.fn();
    const store = createSpendStore({
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
