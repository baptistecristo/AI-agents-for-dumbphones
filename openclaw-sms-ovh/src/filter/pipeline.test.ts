import { describe, expect, it, vi } from "vitest";

import type { TextModel } from "./classifier.js";
import { filterNotifications } from "./pipeline.js";
import { emptyRateLimitState, DEFAULT_RATE_LIMITS } from "./rate-limit.js";
import { DEFAULT_CONFIG, type FilterConfig, type Notification } from "./rules.js";

const NOW = Date.parse("2026-07-20T12:00:00.000Z");

function note(overrides: Partial<Notification> = {}): Notification {
  return { app: "whatsapp", title: "Marie", body: "coucou", ...overrides };
}

const isUrgencyPrompt = (prompt: string) => prompt.includes("answer with its number");

/** A model that answers the two prompt kinds independently. */
function model(opts: { classify?: string; urgency?: string } = {}): TextModel {
  return vi.fn(async (prompt: string) =>
    isUrgencyPrompt(prompt) ? (opts.urgency ?? "") : (opts.classify ?? "DROP"),
  );
}

const NEVER_LIMITED = { ...DEFAULT_RATE_LIMITS, cooldownSeconds: 0, softDailyBudget: 1000, hardDailyBudget: 1000 };

describe("filterNotifications", () => {
  it("forwards a message a rule sends outright, without consulting the model", async () => {
    const spy = model();
    const { outcomes } = await filterNotifications(
      [note({ body: "Your verification code is 483920" })],
      emptyRateLimitState(),
      { config: DEFAULT_CONFIG, model: spy, limits: NEVER_LIMITED, now: () => NOW },
    );

    expect(outcomes[0]?.forward).toBe(true);
    expect(outcomes[0]?.stage).toBe("rules");
    expect(outcomes[0]?.text).toContain("483920");
  });

  it("drops an unknown app without consulting the model", async () => {
    const spy = model();
    const { outcomes } = await filterNotifications([note({ app: "linkedin" })], emptyRateLimitState(), {
      config: DEFAULT_CONFIG,
      model: spy,
      limits: NEVER_LIMITED,
      now: () => NOW,
    });

    expect(outcomes[0]?.forward).toBe(false);
    expect(outcomes[0]?.stage).toBe("rules");
  });

  it("asks the classifier about an ambiguous message and forwards on SEND", async () => {
    const { outcomes } = await filterNotifications([note()], emptyRateLimitState(), {
      config: DEFAULT_CONFIG,
      model: model({ classify: "SEND" }),
      limits: NEVER_LIMITED,
      now: () => NOW,
    });

    expect(outcomes[0]?.forward).toBe(true);
    expect(outcomes[0]?.stage).toBe("classifier");
  });

  it("drops on DROP and reports the classifier as the deciding stage", async () => {
    const { outcomes } = await filterNotifications([note()], emptyRateLimitState(), {
      config: DEFAULT_CONFIG,
      model: model({ classify: "DROP", urgency: "1. NORMAL" }),
      limits: NEVER_LIMITED,
      now: () => NOW,
    });

    expect(outcomes[0]?.forward).toBe(false);
    expect(outcomes[0]?.stage).toBe("classifier");
  });

  it("rescues a dropped message the urgency pass flags as an emergency", async () => {
    const { outcomes } = await filterNotifications(
      [note({ body: "there has been an accident" })],
      emptyRateLimitState(),
      {
        config: DEFAULT_CONFIG,
        model: model({ classify: "DROP", urgency: "1. URGENT" }),
        limits: NEVER_LIMITED,
        now: () => NOW,
      },
    );

    expect(outcomes[0]?.forward).toBe(true);
    expect(outcomes[0]?.stage).toBe("urgency");
    expect(outcomes[0]?.priority).toBe("critical");
  });

  it("never rescues a final drop, so the agent cannot feed itself", async () => {
    // The loopback rule is marked finalDrop precisely to prevent this.
    const { outcomes } = await filterNotifications(
      [note({ title: "OpenClaw", body: "help, there has been an accident" })],
      emptyRateLimitState(),
      {
        config: DEFAULT_CONFIG,
        model: model({ classify: "SEND", urgency: "1. URGENT" }),
        limits: NEVER_LIMITED,
        now: () => NOW,
      },
    );

    expect(outcomes[0]?.forward).toBe(false);
    expect(outcomes[0]?.reason).toContain("loopback");
  });

  it("keeps outcomes aligned with the input order", async () => {
    const notes = [
      note({ body: "Your code is 111111" }), // rules: send
      note({ app: "linkedin" }), // rules: drop
      note({ body: "on se voit a 18h" }), // classifier
    ];
    const { outcomes } = await filterNotifications(notes, emptyRateLimitState(), {
      config: DEFAULT_CONFIG,
      model: model({ classify: "SEND", urgency: "1. NORMAL" }),
      limits: NEVER_LIMITED,
      now: () => NOW,
    });

    expect(outcomes).toHaveLength(3);
    expect(outcomes.map((o) => o.forward)).toEqual([true, false, true]);
    expect(outcomes[1]?.notification.app).toBe("linkedin");
  });

  it("stops forwarding once the budget is exhausted", async () => {
    const notes = Array.from({ length: 12 }, (_, i) => note({ body: `distinct message ${i}` }));
    const { outcomes } = await filterNotifications(notes, emptyRateLimitState(), {
      config: DEFAULT_CONFIG,
      model: model({ classify: "SEND", urgency: "" }),
      limits: { ...DEFAULT_RATE_LIMITS, cooldownSeconds: 0, softDailyBudget: 0.5, hardDailyBudget: 1 },
      now: () => NOW,
    });

    const forwarded = outcomes.filter((o) => o.forward);
    const blocked = outcomes.filter((o) => !o.forward && o.stage === "spend");

    // 0.12 per message against a 0.50 ceiling: four get through, the rest do not.
    expect(forwarded).toHaveLength(4);
    expect(blocked.length).toBeGreaterThan(0);
    expect(blocked[0]?.reason).toContain("budget");
  });

  it("reports a cost for dropped messages too, so the saving is visible", async () => {
    const { outcomes } = await filterNotifications([note({ app: "linkedin" })], emptyRateLimitState(), {
      config: DEFAULT_CONFIG,
      model: model(),
      limits: NEVER_LIMITED,
      now: () => NOW,
    });

    expect(outcomes[0]?.forward).toBe(false);
    expect(outcomes[0]?.cost).toBeGreaterThan(0);
  });

  it("carries spend state forward across batches", async () => {
    const deps = {
      config: DEFAULT_CONFIG,
      model: model({ classify: "SEND", urgency: "" }),
      limits: NEVER_LIMITED,
      now: () => NOW,
    };

    const first = await filterNotifications([note({ body: "one" })], emptyRateLimitState(), deps);
    expect(first.state.sends).toHaveLength(1);

    const second = await filterNotifications([note({ body: "two" })], first.state, deps);
    expect(second.state.sends).toHaveLength(2);
  });

  it("does not charge for a message the spend gate refused", async () => {
    const deps = {
      config: DEFAULT_CONFIG,
      model: model({ classify: "SEND", urgency: "" }),
      limits: { ...DEFAULT_RATE_LIMITS, cooldownSeconds: 0, softDailyBudget: 0.12, hardDailyBudget: 0.12 },
      now: () => NOW,
    };

    const { outcomes, state } = await filterNotifications(
      [note({ body: "one" }), note({ body: "two" })],
      emptyRateLimitState(),
      deps,
    );

    expect(outcomes.filter((o) => o.forward)).toHaveLength(1);
    expect(state.sends).toHaveLength(1);
  });

  it("handles an empty batch without calling the model", async () => {
    const spy = model();
    const { outcomes } = await filterNotifications([], emptyRateLimitState(), {
      config: DEFAULT_CONFIG,
      model: spy,
      limits: NEVER_LIMITED,
      now: () => NOW,
    });

    expect(outcomes).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("batches the urgency pass into a single call for many drops", async () => {
    const spy = vi.fn(async (prompt: string) => (isUrgencyPrompt(prompt) ? "" : "DROP"));
    const config: FilterConfig = {
      global: { unknown_apps: "drop", rules: [] },
      apps: { signal: { default: "llm", rules: [] } },
    };
    const notes = Array.from({ length: 5 }, (_, i) =>
      note({ app: "signal", title: `Sender${i}`, body: `message ${i}` }),
    );

    await filterNotifications(notes, emptyRateLimitState(), {
      config,
      model: spy,
      limits: NEVER_LIMITED,
      now: () => NOW,
    });

    const urgencyCalls = spy.mock.calls.filter(([prompt]) => isUrgencyPrompt(prompt));
    expect(urgencyCalls).toHaveLength(1);
  });
});
