import { describe, expect, it } from "vitest";

import {
  DEFAULT_CONFIG,
  evaluate,
  matches,
  normalizeText,
  type FilterConfig,
  type Notification,
} from "./rules.js";

function note(overrides: Partial<Notification> = {}): Notification {
  return { app: "whatsapp", title: "Marie", body: "on se voit a 18h", ...overrides };
}

describe("normalizeText", () => {
  it("lowercases", () => {
    expect(normalizeText("URGENT")).toBe("urgent");
  });

  it("removes zero-width characters used to evade substring rules", () => {
    // U+200C between "u" and "rgent".
    const evasive = `u${String.fromCodePoint(0x200c)}rgent`;
    expect(normalizeText(evasive)).toBe("urgent");
  });

  it("removes bidi overrides", () => {
    const evasive = `${String.fromCodePoint(0x202e)}urgent`;
    expect(normalizeText(evasive)).toBe("urgent");
  });

  it("turns newlines into spaces instead of deleting them", () => {
    // Deleting would produce "helloworld" and could invent a match.
    expect(normalizeText("hello\nworld")).toBe("hello world");
  });
});

describe("matches", () => {
  it("ANDs every condition on a rule", () => {
    const rule = { sender_contains: "marie", body_contains: "18h", action: "send" } as const;
    expect(matches(rule, note())).toBe(true);
    expect(matches(rule, note({ body: "on se voit demain" }))).toBe(false);
    expect(matches(rule, note({ title: "Paul" }))).toBe(false);
  });

  it("is case-insensitive on both pattern and content", () => {
    expect(matches({ sender_contains: "MARIE", action: "send" }, note())).toBe(true);
    expect(matches({ sender_contains: "marie", action: "send" }, note({ title: "MARIE" }))).toBe(
      true,
    );
  });

  it("honours negation matchers", () => {
    const rule = { body_not_contains: "lol", action: "send" } as const;
    expect(matches(rule, note())).toBe(true);
    expect(matches(rule, note({ body: "lol ok" }))).toBe(false);
  });

  it("matches `contains` against either title or body", () => {
    expect(matches({ contains: "marie", action: "send" }, note())).toBe(true);
    expect(matches({ contains: "18h", action: "send" }, note())).toBe(true);
    expect(matches({ contains: "absent", action: "send" }, note())).toBe(false);
  });

  it("supports regex matchers", () => {
    expect(matches({ body_regex: "\\d{2}h", action: "send" }, note())).toBe(true);
    expect(matches({ body_regex: "^\\d+$", action: "send" }, note())).toBe(false);
  });

  it("matches everything when the rule has no conditions", () => {
    expect(matches({ action: "drop" }, note())).toBe(true);
  });

  it("only inspects the channel when the rule asks about it", () => {
    expect(matches({ channel_contains: "famille", action: "drop" }, note())).toBe(false);
    expect(
      matches({ channel_contains: "famille", action: "drop" }, note({ channel: "Famille ❤️" })),
    ).toBe(true);
  });
});

describe("evaluate precedence", () => {
  const config: FilterConfig = {
    global: {
      unknown_apps: "drop",
      rules: [{ body_contains: "spam", action: "drop", reason: "global spam" }],
    },
    apps: {
      whatsapp: {
        default: "llm",
        rules: [{ sender_contains: "marie", action: "send", reason: "partner" }],
      },
      signal: { default: "send", rules: [] },
    },
  };

  it("checks global rules before app rules", () => {
    // Marie would otherwise be an unconditional send.
    const result = evaluate(config, note({ body: "spam offer" }));
    expect(result.action).toBe("drop");
    expect(result.reason).toBe("global spam");
  });

  it("applies app rules when no global rule matches", () => {
    const result = evaluate(config, note());
    expect(result.action).toBe("send");
    expect(result.reason).toBe("partner");
  });

  it("falls back to the app default", () => {
    const result = evaluate(config, note({ title: "Inconnu" }));
    expect(result.action).toBe("llm");
    expect(result.reason).toBe("whatsapp default");
  });

  it("uses unknown_apps for an app with no config entry", () => {
    const result = evaluate(config, note({ app: "tiktok" }));
    expect(result.action).toBe("drop");
    expect(result.reason).toContain("tiktok");
  });

  it("defaults priority to `default` and carries an explicit one through", () => {
    expect(evaluate(config, note()).priority).toBe("default");

    const escalating: FilterConfig = {
      ...config,
      apps: {
        ...config.apps,
        whatsapp: {
          default: "drop",
          rules: [{ sender_contains: "marie", action: "send", priority: "critical" }],
        },
      },
    };
    expect(evaluate(escalating, note()).priority).toBe("critical");
  });
});

describe("DEFAULT_CONFIG", () => {
  it("drops unknown apps rather than forwarding them", () => {
    expect(evaluate(DEFAULT_CONFIG, note({ app: "linkedin" })).action).toBe("drop");
  });

  it("never loops the agent's own messages back to the user", () => {
    expect(evaluate(DEFAULT_CONFIG, note({ title: "OpenClaw" })).action).toBe("drop");
  });

  it("always forwards a one-time code, in each supported language", () => {
    for (const body of [
      "Your verification code is 483920",
      "Votre code de verification 483920",
      "Tu codigo 483920",
    ]) {
      expect(evaluate(DEFAULT_CONFIG, note({ body })).action).toBe("send");
    }
  });

  it("does not call it a one-time code when the digits are far from the word", () => {
    // A year and an unrelated mention of "code" at opposite ends of a long
    // message must not escalate to an unconditional send.
    const body = `On a fete 2024 ${"comme prevu ".repeat(8)}avec le code vestimentaire`;
    expect(evaluate(DEFAULT_CONFIG, note({ body })).action).not.toBe("send");
  });

  it("sends ambiguous one-to-one messages to the classifier rather than guessing", () => {
    expect(evaluate(DEFAULT_CONFIG, note()).action).toBe("llm");
    expect(evaluate(DEFAULT_CONFIG, note({ app: "signal" })).action).toBe("llm");
  });
});
