/**
 * Stage 2: LLM adjudication of notifications the rules could not decide.
 *
 * Prompt design follows Sift by Ed Leeman (https://github.com/edleeman17/sift,
 * MIT). The central trick is his: tell the model what the message actually
 * costs and make it justify the spend. A model asked "is this important?"
 * says yes to almost everything; a model asked "is this worth 12 cents?"
 * behaves like someone spending their own money.
 *
 * Where this differs: Sift hardcodes a flat per-message price. A real SMS is
 * billed per segment, and an accented or emoji-bearing message can be three
 * times the price of the same text without them, so the figure here is
 * computed for the specific message being judged.
 */

import { analyze } from "../encoding.js";
import type { Notification } from "./rules.js";

/**
 * A single text completion. Injected so the pipeline can be tested without a
 * network call, and so a self-hoster can point this at a local model rather
 * than a paid API.
 */
export type TextModel = (prompt: string) => Promise<string>;

export interface CostModel {
  /** Price of one SMS credit, in the account's currency. */
  pricePerCredit: number;
  /** Credits consumed per segment. Time2Chat charges 2, standard charges 1. */
  creditsPerSegment: number;
  /** Currency symbol used when talking to the model. */
  currency: string;
}

export const TIME2CHAT_COST: CostModel = {
  pricePerCredit: 0.06,
  creditsPerSegment: 2,
  currency: "EUR",
};

export interface ClassificationResult {
  send: boolean;
  reason: string;
  /** What this message would have cost to forward. */
  cost: number;
}

/** What the user would be billed to forward this notification verbatim. */
export function costOf(notification: Notification, cost: CostModel): number {
  const rendered = renderForSms(notification);
  return analyze(rendered).segments * cost.creditsPerSegment * cost.pricePerCredit;
}

/** How a forwarded notification appears on the dumbphone. */
export function renderForSms(notification: Notification): string {
  const from = notification.channel ?? notification.title;
  return `${from}: ${notification.body}`;
}

function formatMoney(amount: number, currency: string): string {
  return `${amount.toFixed(2)} ${currency}`;
}

export function buildClassifierPrompt(
  notification: Notification,
  cost: CostModel,
  override?: string,
): string {
  if (override !== undefined) return override;

  const price = formatMoney(costOf(notification, cost), cost.currency);

  return `You are deciding whether to forward a phone notification to someone who uses a basic phone with no apps. Forwarding this one costs ${price}, charged to them.

Only answer SEND if the message needs attention now or is time-sensitive. They can look at their phone later for anything else. When in doubt, answer DROP.

App: ${notification.app}
From: ${notification.title}
Message: ${notification.body}

Answer SEND when the message is:
- someone proposing to meet or making a plan
- a direct question waiting on an answer
- a problem reported by a client or colleague
- someone who needs help, or is waiting on them

Answer DROP when the message is:
- group banter, reactions, "lol", "ok", "thanks"
- a meme, link, photo or video to look at later
- news, updates, announcements
- social media engagement
- marketing, newsletters, receipts

Answer with one word, SEND or DROP:`;
}

/**
 * Parse the model's verdict.
 *
 * Only a leading SEND counts. Anything else, including a hedged explanation or
 * an empty response, is treated as DROP, because the failure that costs money
 * is the one that forwards.
 */
export function parseVerdict(raw: string): boolean {
  const first = raw.trim().split(/\s+/)[0] ?? "";
  return first.toUpperCase().replace(/[^A-Z]/g, "") === "SEND";
}

export async function classify(
  model: TextModel,
  notification: Notification,
  options: { cost?: CostModel; prompt?: string } = {},
): Promise<ClassificationResult> {
  const cost = options.cost ?? TIME2CHAT_COST;
  const price = costOf(notification, cost);

  let raw: string;
  try {
    raw = await model(buildClassifierPrompt(notification, cost, options.prompt));
  } catch (error) {
    // Fail closed. A classifier outage must not turn into a bill, and stage 3
    // still re-examines everything dropped here for a genuine emergency.
    return {
      send: false,
      reason: `classifier unavailable (${error instanceof Error ? error.message : "unknown"})`,
      cost: price,
    };
  }

  const send = parseVerdict(raw);
  return {
    send,
    reason: send ? "classifier: worth the cost" : "classifier: not worth the cost",
    cost: price,
  };
}
