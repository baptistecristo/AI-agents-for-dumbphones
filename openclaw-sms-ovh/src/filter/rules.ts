/**
 * Deterministic notification rules: stage 1 of the filter cascade.
 *
 * Design ported from Sift by Ed Leeman (https://github.com/edleeman17/sift,
 * MIT), which solves the same problem: deciding which phone notifications are
 * worth forwarding to a dumbphone when every forward costs real money. The
 * rule schema and precedence order follow his; the code is a TypeScript
 * reimplementation rather than a translation. The MIT permission notice is
 * reproduced in THIRD-PARTY-NOTICES.md at the root of this package.
 *
 * Why rules come first: an LLM call per notification is both slow and a
 * running cost, and most traffic is obviously noise. Rules are free and
 * instant, so they should absorb everything they can, leaving the classifier
 * to adjudicate only genuinely ambiguous messages.
 *
 * The default posture is DROP. A notification has to earn its way to someone's
 * phone.
 */

export type Action = "send" | "drop" | "llm";

/**
 * `critical` and `high` exist to let a rule bypass the rate limiter later in
 * the pipeline. They do not affect matching.
 */
export type Priority = "default" | "high" | "critical";

export interface Notification {
  /** Source channel plugin id, e.g. "whatsapp", "signal", "imessage". */
  app: string;
  /** Sender or conversation name, as the source app presents it. */
  title: string;
  body: string;
  /** Group or thread name, when the source distinguishes it from `title`. */
  channel?: string;
}

export interface Rule {
  sender_contains?: string;
  sender_not_contains?: string;
  body_contains?: string;
  body_not_contains?: string;
  channel_contains?: string;
  /** Matches against title OR body. */
  contains?: string;
  sender_regex?: string;
  body_regex?: string;
  /** Matches against title OR body. */
  regex?: string;
  /**
   * Matches on whether the notification looks like a group conversation.
   *
   * Reuses `looksLikeGroup`, deliberately: the emergency re-check at stage 3
   * already refuses to treat groups as urgent, and two separate notions of
   * "this is a group" would eventually disagree.
   */
  is_group?: boolean;
  action: Action;
  priority?: Priority;
  /** Overrides the default classifier prompt when `action` is "llm". */
  prompt?: string;
  /** Human-readable explanation, surfaced in logs and the audit trail. */
  reason?: string;
  /**
   * Exempt this rule's drops from the stage 3 emergency re-check.
   *
   * Needed for anything that must never be forwarded under any circumstance.
   * The agent's own outbound messages are the load-bearing case: rescuing one
   * would feed the bridge its own output and loop.
   */
  finalDrop?: boolean;
}

export interface AppConfig {
  default: Action;
  rules: Rule[];
}

export interface FilterConfig {
  global: {
    /** What to do with an app that has no entry in `apps`. */
    unknown_apps: Action;
    rules: Rule[];
  };
  apps: Record<string, AppConfig>;
}

export interface RuleResult {
  action: Action;
  reason: string;
  priority: Priority;
  /** True when this drop must not be revisited by the emergency re-check. */
  finalDrop: boolean;
  prompt?: string;
}

const ZERO_WIDTH_START = 0x200b;
const ZERO_WIDTH_END = 0x200f;
const BIDI_START = 0x202a;
const BIDI_END = 0x202e;
const INVISIBLE_OP_START = 0x2060;
const INVISIBLE_OP_END = 0x2064;
const BOM = 0xfeff;

/**
 * Zero-width joiners, bidi overrides, word joiners and the BOM. These carry no
 * meaning in a notification and exist here only as an evasion vector.
 */
function isInvisible(cp: number): boolean {
  return (
    (cp >= ZERO_WIDTH_START && cp <= ZERO_WIDTH_END) ||
    (cp >= BIDI_START && cp <= BIDI_END) ||
    (cp >= INVISIBLE_OP_START && cp <= INVISIBLE_OP_END) ||
    cp === BOM
  );
}

/** C0 and C1 control characters. */
function isControl(cp: number): boolean {
  return cp <= 0x1f || (cp >= 0x7f && cp <= 0x9f);
}

/**
 * Strip invisible and control characters, fold whitespace, then lowercase.
 *
 * Zero-width joiners are a real evasion vector in messaging apps: "urgent"
 * would slip past a `body_contains: urgent` rule if left in place. Newlines
 * become spaces rather than vanishing, so "hello\nworld" does not collapse
 * into "helloworld" and invent a match that was never there.
 */
export function normalizeText(text: string): string {
  let out = "";
  for (const char of text) {
    const cp = char.codePointAt(0) ?? 0;
    if (isInvisible(cp)) continue;
    // Whitespace-ish controls become spaces so "hello\nworld" does not
    // collapse into "helloworld" and invent a match that was never there.
    if (isControl(cp)) {
      out += cp === 0x0a || cp === 0x0d || cp === 0x09 || cp === 0x0b || cp === 0x0c ? " " : "";
      continue;
    }
    out += char;
  }
  return out.toLowerCase();
}

/**
 * Heuristic group detection.
 *
 * Messaging apps do not label group chats consistently, so this reads the
 * conversation name: an explicit channel, a comma-separated participant list,
 * or the tilde some clients prefix to a sender inside a group.
 *
 * Lives here rather than beside the urgency stage because both stages need it:
 * stage 1 drops groups before they can be billed, and stage 3 refuses to treat
 * them as emergencies.
 */
export function looksLikeGroup(notification: Notification): boolean {
  if (notification.channel !== undefined && notification.channel.trim() !== "") return true;
  const title = notification.title;
  return title.includes(",") || title.includes("~") || /\bgroup\b/i.test(title);
}

const regexCache = new Map<string, RegExp>();

function compile(pattern: string): RegExp {
  const cached = regexCache.get(pattern);
  if (cached) return cached;
  // Case-insensitive to match the substring matchers' behaviour.
  const compiled = new RegExp(pattern, "i");
  regexCache.set(pattern, compiled);
  return compiled;
}

/**
 * All conditions present on a rule must pass. An empty rule (action only)
 * matches everything, which is how a catch-all is written.
 */
export function matches(rule: Rule, notification: Notification): boolean {
  const title = normalizeText(notification.title);
  const body = normalizeText(notification.body);
  const channel = normalizeText(notification.channel ?? "");

  if (rule.sender_contains !== undefined) {
    if (!title.includes(normalizeText(rule.sender_contains))) return false;
  }
  if (rule.sender_not_contains !== undefined) {
    if (title.includes(normalizeText(rule.sender_not_contains))) return false;
  }
  if (rule.body_contains !== undefined) {
    if (!body.includes(normalizeText(rule.body_contains))) return false;
  }
  if (rule.body_not_contains !== undefined) {
    if (body.includes(normalizeText(rule.body_not_contains))) return false;
  }
  if (rule.channel_contains !== undefined) {
    if (!channel.includes(normalizeText(rule.channel_contains))) return false;
  }
  if (rule.contains !== undefined) {
    const needle = normalizeText(rule.contains);
    if (!title.includes(needle) && !body.includes(needle)) return false;
  }
  if (rule.sender_regex !== undefined) {
    if (!compile(rule.sender_regex).test(title)) return false;
  }
  if (rule.body_regex !== undefined) {
    if (!compile(rule.body_regex).test(body)) return false;
  }
  if (rule.regex !== undefined) {
    const re = compile(rule.regex);
    if (!re.test(title) && !re.test(body)) return false;
  }
  if (rule.is_group !== undefined) {
    if (looksLikeGroup(notification) !== rule.is_group) return false;
  }
  return true;
}

function toResult(rule: Rule, fallbackReason: string): RuleResult {
  const result: RuleResult = {
    action: rule.action,
    reason: rule.reason ?? fallbackReason,
    priority: rule.priority ?? "default",
    finalDrop: rule.finalDrop ?? false,
  };
  // Assigned conditionally because exactOptionalPropertyTypes forbids
  // writing `undefined` into an optional property.
  if (rule.prompt !== undefined) result.prompt = rule.prompt;
  return result;
}

/**
 * Decide what to do with one notification. First match wins, in this order:
 *
 *   1. global rules       (cross-app kill switches and escalations)
 *   2. app-specific rules
 *   3. unknown_apps       (only when the app has no config entry)
 *   4. the app's default
 */
export function evaluate(config: FilterConfig, notification: Notification): RuleResult {
  for (const rule of config.global.rules) {
    if (matches(rule, notification)) return toResult(rule, "matched global rule");
  }

  const app = config.apps[notification.app];
  if (app === undefined) {
    return {
      action: config.global.unknown_apps,
      reason: `unknown app "${notification.app}"`,
      priority: "default",
      finalDrop: false,
    };
  }

  for (const rule of app.rules) {
    if (matches(rule, notification)) {
      return toResult(rule, `matched ${notification.app} rule`);
    }
  }

  return {
    action: app.default,
    reason: `${notification.app} default`,
    priority: "default",
    finalDrop: false,
  };
}

/**
 * Phrases that mark a one-time code, across the three languages the project
 * supports. Both accented and unaccented spellings are listed because senders
 * are inconsistent and normalisation preserves accents.
 *
 * The word "code" on its own is deliberately NOT enough. "Use code 1234 for
 * 20% off this weekend" is a discount, not a login, and the earlier version of
 * this rule forwarded it: an unconditional SEND at `high` priority, which also
 * skips the cooldown. Any sender able to put the word "code" next to four
 * digits could spend the user's budget at will, including from an app that
 * `unknown_apps: "drop"` would otherwise have rejected, because this is a
 * global rule and global rules run first.
 *
 * A real one-time code carries verification framing around the digits, so the
 * rule asks for that framing rather than for the bare word.
 */
const OTP_QUALIFIERS = [
  "otp",
  "one[\\s-]?time\\s+(?:code|password|pin)",
  "(?:verification|verify|security|login|log[\\s-]?in|sign[\\s-]?in|access|confirmation|authentication|auth|2fa)\\s+code",
  // "your code", and also "your Google verification code".
  "your\\s+(?:\\S+\\s+){0,3}code",
  "votre\\s+code",
  "code\\s+(?:de\\s+|d')?(?:v\\u00e9rification|verification|s\\u00e9curit\\u00e9|securite|confirmation|acc\\u00e8s|acces|connexion)",
  "(?:su|tu)\\s+c(?:\\u00f3|o)digo",
  "c(?:\\u00f3|o)digo\\s+de\\s+(?:verificaci(?:\\u00f3|o)n|seguridad|acceso|confirmaci(?:\\u00f3|o)n)",
].join("|");

/**
 * Markers that make a message an advert whatever else it says.
 *
 * A second line of defence, because a marketing message is perfectly capable
 * of writing "your code": "your discount code 1234". Checked across the whole
 * body rather than near the digits, since the giveaway is often at the other
 * end of the text.
 */
const PROMO_MARKERS = [
  "\\bpromo",
  "\\bcoupon",
  "\\bdiscount",
  "\\bvoucher",
  "%\\s*off",
  "\\boff\\s+your\\b",
  "\\bsale\\b",
  "\\bunsubscribe\\b",
  "\\br\\u00e9duction",
  "\\breduction\\b",
  "\\bremise\\b",
  "\\bsoldes\\b",
  "\\bd\\u00e9sabonner",
  "\\bdescuento",
  "\\boferta",
  "\\brebaja",
].join("|");

const OTP_DIGITS = "\\b\\d{4,8}\\b";

/** A qualified code phrase near the digits, in either order. */
const OTP_NEAR_DIGITS = [
  `${OTP_DIGITS}[^\\n]{0,40}(?:${OTP_QUALIFIERS})`,
  `(?:${OTP_QUALIFIERS})[^\\n]{0,40}${OTP_DIGITS}`,
].join("|");

/**
 * The body must clear the promotional exclusion before the proximity match is
 * considered at all. `normalizeText` has already folded the body onto one
 * line, so anchoring at the start covers the whole message.
 */
const OTP_BODY_REGEX = `^(?!.*(?:${PROMO_MARKERS})).*(?:${OTP_NEAR_DIGITS})`;

/**
 * Drop group traffic before the classifier is billed for it.
 *
 * Not `finalDrop`: stage 3 answers groups from the same heuristic without
 * calling a model, so leaving them reviewable costs nothing and keeps the
 * exemption reserved for things that must never be forwarded at all.
 */
const GROUP_DROP: Rule = {
  is_group: true,
  action: "drop",
  reason: "group conversation",
};

/**
 * A starting configuration that errs heavily toward silence.
 *
 * Nothing here is tuned for a specific person; it is the shape a user edits.
 * Unknown apps are dropped outright, and the only SEND that skips the
 * classifier is a one-time code, which is worth money precisely because it is
 * useless late.
 */
export const DEFAULT_CONFIG: FilterConfig = {
  global: {
    unknown_apps: "drop",
    rules: [
      // Never forward the agent's own outbound messages back to the user.
      {
        sender_contains: "openclaw",
        action: "drop",
        reason: "agent loopback",
        finalDrop: true,
      },
      {
        // The code appears before the phrase ("483920 is your code") about as
        // often as after it ("your code is 483920"), so both orders match.
        // Bounded to 40 characters so a digit at one end of a long message and
        // the phrase at the other do not combine into a false positive.
        body_regex: OTP_BODY_REGEX,
        action: "send",
        priority: "high",
        reason: "one-time code",
      },
    ],
  },
  apps: {
    // Group traffic is the single largest source of volume and the reason a
    // per-message bill becomes unaffordable, so groups are dropped here, at
    // stage 1, and only one-to-one messages reach the classifier. Dropping
    // them later would mean paying for a model call to decide something the
    // conversation shape already answers.
    whatsapp: {
      default: "llm",
      rules: [GROUP_DROP],
    },
    signal: { default: "llm", rules: [GROUP_DROP] },
    imessage: { default: "llm", rules: [GROUP_DROP] },
    // Bot API only: it never sees the user's personal conversations, so
    // anything arriving here is addressed to the bot and worth adjudicating.
    telegram: { default: "llm", rules: [] },
  },
};
