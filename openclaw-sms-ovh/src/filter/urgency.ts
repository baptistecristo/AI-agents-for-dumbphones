/**
 * Stage 3: a second look at messages already dropped.
 *
 * The idea is Ed Leeman's, and it is the part of Sift he reports actually
 * earning its keep: after everything else has decided to stay silent, re-read
 * the discarded messages looking only for genuine distress. Roughly one or two
 * a week get rescued that the earlier stages would have thrown away.
 *
 * It looks for actual emergencies, not the word "urgent", which people
 * overuse to the point of meaninglessness.
 *
 * Batched because it runs on every dropped message, which is most of them.
 * Ten per call turns the expensive stage into a rounding error.
 */

import type { TextModel } from "./classifier.js";
import type { Notification } from "./rules.js";

export const MAX_BATCH = 10;

export interface UrgencyResult {
  urgent: boolean;
  reason: string;
}

/**
 * Heuristic group detection.
 *
 * Messaging apps do not label group chats consistently, so this reads the
 * conversation name: an explicit channel, a comma-separated participant list,
 * or the tilde some clients prefix to a sender inside a group. Groups are
 * never treated as emergencies, which removes the largest source of false
 * positives at a stroke.
 */
export function looksLikeGroup(notification: Notification): boolean {
  if (notification.channel !== undefined && notification.channel.trim() !== "") return true;
  const title = notification.title;
  return title.includes(",") || title.includes("~") || /\bgroup\b/i.test(title);
}

export function buildUrgencyPrompt(notifications: Notification[]): string {
  const lines = notifications
    .map((n, i) => `${i + 1}. From ${n.title}: ${n.body.slice(0, 200)}`)
    .join("\n");

  return `Classify these chat messages. Answer NORMAL unless there is a genuine emergency.

URGENT is extremely rare, and means only:
- someone in physical danger or having a medical emergency
- "help", "call an ambulance", "I'm hurt", "there's been an accident"
- an explicit "call me NOW, it's urgent"

NORMAL covers almost everything, including:
- questions like "how are you?", "you there?", "are you coming?"
- jokes, memes, banter, reactions
- photos, links, videos
- "I'm here", "on my way", "running late"
- opinions, stories, venting, complaining
- "where are you" with no sign of distress
- anything that can wait an hour

Messages:
${lines}

For each message, answer with its number and NORMAL or URGENT, one per line:`;
}

/**
 * Parse numbered verdicts back into per-message results.
 *
 * Missing or unparseable lines default to NORMAL, i.e. the message stays
 * dropped. That is the wrong direction for a genuine emergency, but a
 * classifier that fails open would forward every message it failed to parse,
 * at the user's expense. The rules layer is where a real safety net belongs:
 * a `contains: "ambulance"` rule with `action: send` never depends on a model
 * being reachable.
 */
export function parseUrgencyBatch(raw: string, expected: number): UrgencyResult[] {
  const verdicts = new Map<number, boolean>();

  for (const line of raw.split("\n")) {
    const match = /^\s*(\d+)\s*[.):-]?\s*(URGENT|NORMAL)\b/i.exec(line.trim());
    if (match === null) continue;
    const index = Number(match[1]);
    verdicts.set(index, (match[2] ?? "").toUpperCase() === "URGENT");
  }

  return Array.from({ length: expected }, (_, i) => {
    const verdict = verdicts.get(i + 1);
    if (verdict === undefined) {
      return { urgent: false, reason: "no verdict returned, kept dropped" };
    }
    return verdict
      ? { urgent: true, reason: "possible emergency" }
      : { urgent: false, reason: "not an emergency" };
  });
}

/**
 * Re-examine dropped notifications for genuine emergencies.
 *
 * Group messages are answered without consulting the model at all, which is
 * both cheaper and more accurate than asking.
 */
export async function checkUrgency(
  model: TextModel,
  notifications: Notification[],
  options: { maxBatch?: number } = {},
): Promise<UrgencyResult[]> {
  if (notifications.length === 0) return [];

  const maxBatch = options.maxBatch ?? MAX_BATCH;
  const results = new Array<UrgencyResult>(notifications.length);

  const candidates: Array<{ index: number; notification: Notification }> = [];
  notifications.forEach((notification, index) => {
    if (looksLikeGroup(notification)) {
      results[index] = { urgent: false, reason: "group chat, never urgent" };
      return;
    }
    candidates.push({ index, notification });
  });

  for (let offset = 0; offset < candidates.length; offset += maxBatch) {
    const slice = candidates.slice(offset, offset + maxBatch);
    let raw: string;
    try {
      raw = await model(buildUrgencyPrompt(slice.map((c) => c.notification)));
    } catch (error) {
      const reason = `urgency check unavailable (${
        error instanceof Error ? error.message : "unknown"
      })`;
      for (const { index } of slice) results[index] = { urgent: false, reason };
      continue;
    }

    const parsed = parseUrgencyBatch(raw, slice.length);
    slice.forEach((candidate, i) => {
      results[candidate.index] = parsed[i] ?? {
        urgent: false,
        reason: "no verdict returned, kept dropped",
      };
    });
  }

  return results;
}
