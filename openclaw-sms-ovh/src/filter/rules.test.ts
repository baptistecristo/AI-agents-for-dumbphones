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
      "483920 is your code",
      "G-483920 is your Google verification code",
      "Your OTP is 4821",
      "Votre code de verification 483920",
      "Votre code est 483920",
      "Tu codigo 483920",
      "Su codigo de verificacion es 483920",
    ]) {
      expect(evaluate(DEFAULT_CONFIG, note({ body })).action).toBe("send");
    }
  });

  it("does not treat a bare code word beside digits as a one-time code", () => {
    // The word "code" next to four digits is not a login. Forwarding this was
    // an unconditional SEND at `high` priority, which also skips the cooldown,
    // so any sender able to write "code 1234" could spend the budget at will.
    // None of these carry a promotional marker, so only the requirement for a
    // verification phrase can refuse them.
    for (const body of [
      "Use code 1234 at checkout this weekend",
      "Table booked, the door code is 4821",
      "Le code de la porte est 4821",
      "El codigo del portal es 4821",
    ]) {
      expect(evaluate(DEFAULT_CONFIG, note({ body })).action).not.toBe("send");
    }
  });

  it("does not treat a discount code as a one-time code", () => {
    // Marketing writes "your code" perfectly happily, so the verification
    // phrase alone is not enough. These are refused on the promotional
    // markers instead.
    for (const body of [
      "Use code 1234 for 20% off this weekend",
      "Your promo code 4821 gives you 15% off",
      "Your code 9080 gets you a discount at checkout",
      "Votre code 4821 : 15% de reduction",
    ]) {
      expect(evaluate(DEFAULT_CONFIG, note({ body })).action).not.toBe("send");
    }
  });

  it("does not let a marketing message from an unknown app reach the phone", () => {
    // Global rules run before `unknown_apps`, so an unconditional SEND there
    // hands the budget to every app the user never configured.
    const body = "Use code 1234 for 20% off this weekend";
    expect(evaluate(DEFAULT_CONFIG, note({ app: "linkedin", body })).action).toBe("drop");
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

  it("drops group traffic before the classifier can be billed for it", () => {
    for (const notification of [
      note({ channel: "Famille" }),
      note({ title: "Marie, Paul, Luc" }),
      note({ title: "~Marie" }),
      note({ app: "signal", channel: "Voisins" }),
      note({ app: "imessage", title: "Book group" }),
    ]) {
      expect(evaluate(DEFAULT_CONFIG, notification).action).toBe("drop");
    }
  });
});

describe("is_group", () => {
  it("matches group shape, and its negation matches one-to-one", () => {
    const group = note({ channel: "Famille" });

    expect(matches({ is_group: true, action: "drop" }, group)).toBe(true);
    expect(matches({ is_group: true, action: "drop" }, note())).toBe(false);
    expect(matches({ is_group: false, action: "send" }, note())).toBe(true);
    expect(matches({ is_group: false, action: "send" }, group)).toBe(false);
  });

  it("is ignored when the rule says nothing about it", () => {
    expect(matches({ action: "drop" }, note({ channel: "Famille" }))).toBe(true);
    expect(matches({ action: "drop" }, note())).toBe(true);
  });
});
