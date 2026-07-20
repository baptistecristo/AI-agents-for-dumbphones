import { describe, expect, it } from "vitest";

import {
  checkRateLimit,
  DEFAULT_RATE_LIMITS,
  emptyRateLimitState,
  fingerprint,
  recordSend,
  type RateLimitCandidate,
  type RateLimitConfig,
  type RateLimitState,
} from "./rate-limit.js";

const NOW = Date.parse("2026-07-20T12:00:00.000Z");
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

const LIMITS: RateLimitConfig = {
  ...DEFAULT_RATE_LIMITS,
  cooldownSeconds: 30,
  perSenderHourly: 3,
  dedupeSeconds: 300,
  softDailyBudget: 1,
  hardDailyBudget: 2,
};

function candidate(overrides: Partial<RateLimitCandidate> = {}): RateLimitCandidate {
  return {
    app: "whatsapp",
    sender: "Marie",
    text: "Marie: on se voit a 18h",
    cost: 0.12,
    priority: "default",
    ...overrides,
  };
}

/** Build state by replaying sends at given offsets from NOW. */
function stateWith(sends: Array<{ offset: number; c?: Partial<RateLimitCandidate> }>) {
  let state: RateLimitState = emptyRateLimitState();
  for (const send of sends) {
    state = recordSend(state, candidate(send.c), NOW + send.offset);
  }
  return state;
}

describe("fingerprint", () => {
  it("matches identical text and differs on different text", () => {
    expect(fingerprint("hello")).toBe(fingerprint("hello"));
    expect(fingerprint("hello")).not.toBe(fingerprint("hallo"));
  });
});

describe("checkRateLimit", () => {
  it("allows the first message", () => {
    const decision = checkRateLimit(emptyRateLimitState(), candidate(), NOW, LIMITS);
    expect(decision.allowed).toBe(true);
  });

  it("enforces a cooldown between messages", () => {
    const state = stateWith([{ offset: -10 * SECOND }]);
    const decision = checkRateLimit(state, candidate({ text: "different" }), NOW, LIMITS);

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("cooldown");
    expect(decision.reason).toContain("20s");
  });

  it("allows again once the cooldown has elapsed", () => {
    const state = stateWith([{ offset: -31 * SECOND }]);
    expect(checkRateLimit(state, candidate({ text: "different" }), NOW, LIMITS).allowed).toBe(true);
  });

  it("suppresses a repeat of the same text", () => {
    const state = stateWith([{ offset: -60 * SECOND }]);
    const decision = checkRateLimit(state, candidate(), NOW, LIMITS);

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("duplicate");
  });

  it("stops suppressing once the dedupe window passes", () => {
    const state = stateWith([{ offset: -301 * SECOND }]);
    expect(checkRateLimit(state, candidate(), NOW, LIMITS).allowed).toBe(true);
  });

  it("caps messages per sender per hour", () => {
    const state = stateWith([
      { offset: -50 * MINUTE, c: { text: "one" } },
      { offset: -40 * MINUTE, c: { text: "two" } },
      { offset: -30 * MINUTE, c: { text: "three" } },
    ]);
    const decision = checkRateLimit(state, candidate({ text: "four" }), NOW, LIMITS);

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("hourly cap");
  });

  it("counts the hourly cap per sender, not globally", () => {
    const state = stateWith([
      { offset: -50 * MINUTE, c: { text: "one" } },
      { offset: -40 * MINUTE, c: { text: "two" } },
      { offset: -30 * MINUTE, c: { text: "three" } },
    ]);
    const fromSomeoneElse = candidate({ sender: "Paul", text: "four" });

    expect(checkRateLimit(state, fromSomeoneElse, NOW, LIMITS).allowed).toBe(true);
  });

  it("stops ordinary traffic at the soft daily budget", () => {
    // 8 x 0.12 = 0.96; one more crosses the 1.00 soft ceiling.
    const state = stateWith(
      Array.from({ length: 8 }, (_, i) => ({
        offset: -(i + 1) * HOUR,
        c: { text: `msg ${i}` },
      })),
    );
    const decision = checkRateLimit(state, candidate({ text: "another" }), NOW, LIMITS);

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("daily budget");
  });

  it("lets a critical message through the soft budget", () => {
    const state = stateWith(
      Array.from({ length: 8 }, (_, i) => ({
        offset: -(i + 1) * HOUR,
        c: { text: `msg ${i}` },
      })),
    );
    const emergency = candidate({ text: "there has been an accident", priority: "critical" });

    expect(checkRateLimit(state, emergency, NOW, LIMITS).allowed).toBe(true);
  });

  it("stops even critical traffic at the hard budget", () => {
    // Something escalating everything to critical must still terminate.
    const state = stateWith(
      Array.from({ length: 17 }, (_, i) => ({
        offset: -(i + 1) * MINUTE,
        c: { text: `msg ${i}` },
      })),
    );
    const emergency = candidate({ text: "another emergency", priority: "critical" });
    const decision = checkRateLimit(state, emergency, NOW, LIMITS);

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("hard daily budget");
  });

  it("suppresses a duplicate even when it is critical", () => {
    // Repeating an emergency verbatim adds nothing the first one did not say.
    const state = stateWith([{ offset: -60 * SECOND }]);
    const repeat = candidate({ priority: "critical" });

    expect(checkRateLimit(state, repeat, NOW, LIMITS).allowed).toBe(false);
  });

  it("lets high priority skip the cooldown but not the budget", () => {
    const recent = stateWith([{ offset: -5 * SECOND, c: { text: "other" } }]);
    expect(checkRateLimit(recent, candidate({ priority: "high" }), NOW, LIMITS).allowed).toBe(true);

    const spent = stateWith(
      Array.from({ length: 8 }, (_, i) => ({ offset: -(i + 1) * HOUR, c: { text: `m${i}` } })),
    );
    expect(
      checkRateLimit(spent, candidate({ text: "new", priority: "high" }), NOW, LIMITS).allowed,
    ).toBe(false);
  });

  it("ignores spend that has aged out of the rolling day", () => {
    const state = stateWith(
      Array.from({ length: 8 }, (_, i) => ({
        offset: -25 * HOUR - i * MINUTE,
        c: { text: `old ${i}` },
      })),
    );
    expect(checkRateLimit(state, candidate({ text: "fresh" }), NOW, LIMITS).allowed).toBe(true);
  });
});

describe("recordSend", () => {
  it("accumulates spend", () => {
    let state = emptyRateLimitState();
    state = recordSend(state, candidate({ text: "a" }), NOW);
    state = recordSend(state, candidate({ text: "b" }), NOW);

    const decision = checkRateLimit(state, candidate({ text: "c" }), NOW, LIMITS);
    expect(decision.spentToday).toBeCloseTo(0.24);
  });

  it("prunes records older than the rolling day", () => {
    let state = stateWith([{ offset: -25 * HOUR, c: { text: "ancient" } }]);
    state = recordSend(state, candidate({ text: "fresh" }), NOW);

    expect(state.sends).toHaveLength(1);
    expect(state.sends[0]?.fingerprint).toBe(fingerprint("fresh"));
  });
});
