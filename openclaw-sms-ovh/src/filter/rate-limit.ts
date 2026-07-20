/**
 * Spend control: the last gate before a message is actually paid for.
 *
 * The cooldown, per-sender cap and duplicate suppression follow Sift. The
 * budget ceilings do not, and they are the reason this file exists: a filter
 * that only limits message *rate* still has an unbounded bill, because a
 * multi-segment message costs several times a short one. A runaway sender, a
 * misconfigured rule or a chatty week should cost a knowable maximum.
 *
 * Two ceilings, deliberately:
 *
 *  - the soft budget stops ordinary traffic and can be overridden by a
 *    `critical` message, because refusing to forward a medical emergency to
 *    save eight cents would be an indefensible thing for this to do;
 *  - the hard budget stops everything. It exists for the failure where
 *    something is escalating every message to critical, which is the only
 *    scenario where silence is genuinely safer than spending.
 */

import type { Priority } from "./rules.js";

export interface SendRecord {
  /** Epoch milliseconds. */
  at: number;
  cost: number;
  app: string;
  sender: string;
  /** Identifies duplicate content. */
  fingerprint: string;
}

export interface RateLimitState {
  sends: SendRecord[];
}

export interface RateLimitConfig {
  /** Minimum gap between any two forwarded messages. */
  cooldownSeconds: number;
  /** Maximum messages per hour from one sender in one app. */
  perSenderHourly: number;
  /** Window in which an identical message is treated as a repeat. */
  dedupeSeconds: number;
  /** Rolling 24h spend at which ordinary traffic stops. */
  softDailyBudget: number;
  /** Rolling 24h spend at which everything stops. */
  hardDailyBudget: number;
}

export const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  cooldownSeconds: 30,
  perSenderHourly: 50,
  dedupeSeconds: 300,
  softDailyBudget: 2,
  hardDailyBudget: 5,
};

export interface RateLimitCandidate {
  app: string;
  sender: string;
  /** Rendered message text, used to detect repeats. */
  text: string;
  cost: number;
  priority: Priority;
}

export interface RateLimitDecision {
  allowed: boolean;
  reason: string;
  /** Rolling 24h spend including this message if it is allowed. */
  spentToday: number;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export function emptyRateLimitState(): RateLimitState {
  return { sends: [] };
}

/** Cheap content fingerprint. Collisions only suppress a duplicate, so exactness is not required. */
export function fingerprint(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return `${text.length}:${hash}`;
}

function spentSince(state: RateLimitState, since: number): number {
  return state.sends.reduce((total, send) => (send.at >= since ? total + send.cost : total), 0);
}

/**
 * Decide whether a message may be forwarded, and at what point the budget
 * stops it.
 *
 * Pure: the caller records the send with `recordSend` only if it actually
 * happened, so a failed delivery does not consume budget.
 */
export function checkRateLimit(
  state: RateLimitState,
  candidate: RateLimitCandidate,
  now: number,
  config: RateLimitConfig = DEFAULT_RATE_LIMITS,
): RateLimitDecision {
  const spentToday = spentSince(state, now - DAY_MS);
  const projected = spentToday + candidate.cost;
  const isCritical = candidate.priority === "critical";

  // The hard ceiling binds everything, including critical traffic.
  if (projected > config.hardDailyBudget) {
    return {
      allowed: false,
      reason: `hard daily budget reached (${spentToday.toFixed(2)} of ${config.hardDailyBudget})`,
      spentToday,
    };
  }

  if (!isCritical && projected > config.softDailyBudget) {
    return {
      allowed: false,
      reason: `daily budget reached (${spentToday.toFixed(2)} of ${config.softDailyBudget})`,
      spentToday,
    };
  }

  // A repeat of the same text is suppressed regardless of priority: a sender
  // stuck in a loop is the case this exists for, and repeating an emergency
  // verbatim adds nothing the first one did not say.
  const duplicateSince = now - config.dedupeSeconds * 1000;
  const print = fingerprint(candidate.text);
  const isDuplicate = state.sends.some(
    (send) => send.at >= duplicateSince && send.fingerprint === print,
  );
  if (isDuplicate) {
    return { allowed: false, reason: "duplicate of a recent message", spentToday };
  }

  if (isCritical) {
    return { allowed: true, reason: "critical, limits bypassed", spentToday };
  }

  if (candidate.priority !== "high") {
    const lastSend = state.sends.at(-1);
    if (lastSend !== undefined && now - lastSend.at < config.cooldownSeconds * 1000) {
      const wait = Math.ceil((config.cooldownSeconds * 1000 - (now - lastSend.at)) / 1000);
      return { allowed: false, reason: `cooldown, ${wait}s remaining`, spentToday };
    }
  }

  const hourAgo = now - HOUR_MS;
  const fromSender = state.sends.filter(
    (send) => send.at >= hourAgo && send.app === candidate.app && send.sender === candidate.sender,
  ).length;
  if (fromSender >= config.perSenderHourly) {
    return {
      allowed: false,
      reason: `hourly cap for ${candidate.sender} (${config.perSenderHourly})`,
      spentToday,
    };
  }

  return { allowed: true, reason: "within limits", spentToday };
}

/**
 * Record a message that was actually sent.
 *
 * Prunes anything older than the longest window in play, so state stays
 * bounded without a separate sweep.
 */
export function recordSend(
  state: RateLimitState,
  candidate: RateLimitCandidate,
  now: number,
): RateLimitState {
  const record: SendRecord = {
    at: now,
    cost: candidate.cost,
    app: candidate.app,
    sender: candidate.sender,
    fingerprint: fingerprint(candidate.text),
  };
  const cutoff = now - DAY_MS;
  return { sends: [...state.sends.filter((send) => send.at >= cutoff), record] };
}
