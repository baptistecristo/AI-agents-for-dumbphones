/**
 * The full notification cascade, from raw notification to "send this SMS".
 *
 *   1. rules       free, instant, decides most traffic
 *   2. classifier  one LLM call per ambiguous message, cost-aware
 *   3. urgency     one batched LLM call over everything dropped so far
 *   4. spend       cooldown, per-sender cap, duplicate suppression, budget
 *
 * Each stage can only make the outcome quieter, except stage 3, which is the
 * single place a decision can be reversed back toward sending. That asymmetry
 * is intentional: the expensive mistake is forwarding noise, and the
 * unacceptable mistake is silencing an emergency.
 */

import { classify, costOf, renderForSms, TIME2CHAT_COST, type CostModel, type TextModel } from "./classifier.js";
import {
  checkRateLimit,
  DEFAULT_RATE_LIMITS,
  recordSend,
  type RateLimitConfig,
  type RateLimitState,
} from "./rate-limit.js";
import { evaluate, type FilterConfig, type Notification, type Priority } from "./rules.js";
import { checkUrgency } from "./urgency.js";

export type FilterStage = "rules" | "classifier" | "urgency" | "spend";

export interface FilterOutcome {
  notification: Notification;
  forward: boolean;
  /** The stage that made the final call. */
  stage: FilterStage;
  reason: string;
  /** What forwarding this costs, whether or not it was forwarded. */
  cost: number;
  priority: Priority;
  /** The SMS text, present only when `forward` is true. */
  text?: string;
}

export interface PipelineDeps {
  config: FilterConfig;
  model: TextModel;
  cost?: CostModel;
  limits?: RateLimitConfig;
  now?: () => number;
}

interface Pending {
  index: number;
  notification: Notification;
  priority: Priority;
  reason: string;
  stage: FilterStage;
  finalDrop: boolean;
}

/**
 * Run a batch of notifications through every stage.
 *
 * Batched rather than one-at-a-time because stage 3 is only affordable when
 * amortised across ten messages, and because the spend gate has to see the
 * batch in order to apply a cooldown between its own decisions.
 */
export async function filterNotifications(
  notifications: Notification[],
  state: RateLimitState,
  deps: PipelineDeps,
): Promise<{ outcomes: FilterOutcome[]; state: RateLimitState }> {
  const cost = deps.cost ?? TIME2CHAT_COST;
  const limits = deps.limits ?? DEFAULT_RATE_LIMITS;
  const now = deps.now ?? Date.now;

  const outcomes = new Array<FilterOutcome>(notifications.length);
  const toForward: Pending[] = [];
  const dropped: Pending[] = [];

  // Stages 1 and 2.
  for (const [index, notification] of notifications.entries()) {
    const verdict = evaluate(deps.config, notification);
    const entry: Pending = {
      index,
      notification,
      priority: verdict.priority,
      reason: verdict.reason,
      stage: "rules",
      finalDrop: verdict.finalDrop,
    };

    if (verdict.action === "send") {
      toForward.push(entry);
      continue;
    }
    if (verdict.action === "drop") {
      dropped.push(entry);
      continue;
    }

    const options: { cost: CostModel; prompt?: string } = { cost };
    if (verdict.prompt !== undefined) options.prompt = verdict.prompt;
    const decision = await classify(deps.model, notification, options);

    const classified: Pending = {
      ...entry,
      stage: "classifier",
      reason: decision.reason,
    };
    if (decision.send) toForward.push(classified);
    else dropped.push(classified);
  }

  // Stage 3: one more look at what was dropped, for genuine emergencies only.
  const reviewable = dropped.filter((entry) => !entry.finalDrop);
  const verdicts = await checkUrgency(
    deps.model,
    reviewable.map((entry) => entry.notification),
  );

  const rescued = new Set<number>();
  reviewable.forEach((entry, i) => {
    if (verdicts[i]?.urgent !== true) return;
    rescued.add(entry.index);
    toForward.push({
      ...entry,
      stage: "urgency",
      reason: "escalated as a possible emergency",
      // Escalated messages bypass the cooldown and per-sender cap. They do not
      // bypass the hard budget.
      priority: "critical",
    });
  });

  for (const entry of dropped) {
    if (rescued.has(entry.index)) continue;
    outcomes[entry.index] = {
      notification: entry.notification,
      forward: false,
      stage: entry.stage,
      reason: entry.reason,
      cost: costOf(entry.notification, cost),
      priority: entry.priority,
    };
  }

  // Stage 4: spend. Ordered by original position so the cooldown applies in
  // the order the messages actually arrived.
  toForward.sort((a, b) => a.index - b.index);
  let spendState = state;

  for (const entry of toForward) {
    const text = renderForSms(entry.notification);
    const candidate = {
      app: entry.notification.app,
      sender: entry.notification.title,
      text,
      cost: costOf(entry.notification, cost),
      priority: entry.priority,
    };

    const decision = checkRateLimit(spendState, candidate, now(), limits);
    if (!decision.allowed) {
      outcomes[entry.index] = {
        notification: entry.notification,
        forward: false,
        stage: "spend",
        reason: decision.reason,
        cost: candidate.cost,
        priority: entry.priority,
      };
      continue;
    }

    spendState = recordSend(spendState, candidate, now());
    outcomes[entry.index] = {
      notification: entry.notification,
      forward: true,
      stage: entry.stage,
      reason: entry.reason,
      cost: candidate.cost,
      priority: entry.priority,
      text,
    };
  }

  return { outcomes, state: spendState };
}
