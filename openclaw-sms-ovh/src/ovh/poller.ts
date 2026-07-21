/**
 * Inbound SMS polling.
 *
 * Polling rather than the `smsResponse.cgiUrl` webhook, deliberately. Two
 * reasons, both from OVH's own surface:
 *
 *  1. The callback carries no signature, no shared secret, and OVH publishes
 *     no source IP range for it. Anything that can reach the URL can inject a
 *     message that appears to come from the user's phone. For a channel whose
 *     whole purpose is acting on someone's behalf, that is not acceptable.
 *  2. The callback's wire format is undocumented. Method, parameter names and
 *     encoding are all unspecified, and the request to document it has been
 *     open on ovh/docs since 2021. Code written against a guess breaks on
 *     contact with the real thing.
 *
 * Polling is slower and costs API calls, but it is authenticated by the same
 * signature as everything else and its response shape is in the schema. The
 * webhook can be added later as a latency optimisation, once someone has
 * logged a real request and can point it at an unguessable URL.
 */

import type { OvhClient } from "./client.js";
import { getIncoming, listIncomingIds, type OvhIncoming } from "./sms.js";

export interface PollerState {
  /**
   * `creationDatetime` of the newest message handled so far, ISO 8601.
   * Undefined on a cold start, which means "fetch the recent window once".
   */
  watermark?: string;
  /** Ids already handled, most recent last. Bounded by `dedupeWindow`. */
  seenIds: number[];
  /**
   * Read attempts per id, for ids that have failed at least once.
   *
   * A message that cannot be read must not hold up the ones behind it. Keeping
   * the count here lets a transient failure retry on the next poll while a
   * permanent one is eventually abandoned instead of retried forever.
   */
  failures?: Record<number, number>;
}

export interface PollerOptions {
  /**
   * Seconds of overlap re-queried on each poll.
   *
   * OVH stamps `creationDatetime` on its own clock, and a message can land in
   * the list slightly after its timestamp would suggest. Re-asking for a short
   * window behind the watermark costs one extra query and prevents a message
   * arriving during the gap from being skipped forever. Duplicates from the
   * overlap are removed by id.
   */
  overlapSeconds?: number;
  /** How many ids to remember for de-duplication. */
  dedupeWindow?: number;
  /**
   * How far back to look on a cold start. Without this, the first poll after
   * provisioning would replay up to six months of history.
   */
  coldStartSeconds?: number;
  /**
   * How many times a single id may fail to read before it is abandoned.
   *
   * Abandoning means adding it to `seenIds`, so the poll stops asking. That
   * loses one message, which is the lesser harm: the alternative is a poll
   * that throws on the same id every cycle and never delivers anything behind
   * it. Reaching this limit is logged as an error, not swallowed.
   */
  maxReadAttempts?: number;
  /** Injected for tests. */
  now?: () => number;
  /** Optional sink for the abandonment notice. */
  log?: { warn?: (message: string) => void; error?: (message: string) => void };
}

const DEFAULTS = {
  overlapSeconds: 120,
  dedupeWindow: 500,
  coldStartSeconds: 300,
  maxReadAttempts: 5,
};

export function emptyState(): PollerState {
  return { seenIds: [] };
}

/**
 * Fetch inbound messages that have not been handled yet.
 *
 * State is passed in and returned rather than held on an instance, so the
 * caller decides where it persists. A gateway that restarts without saving it
 * will re-deliver at most `coldStartSeconds` of messages, never the whole
 * history.
 *
 * Note that ids are NOT assumed to increase monotonically. OVH does not
 * document that they do, and building on an undocumented ordering is how you
 * get a poller that silently drops messages once a year.
 */
export async function pollIncoming(
  client: OvhClient,
  serviceName: string,
  state: PollerState,
  options: PollerOptions = {},
): Promise<{ messages: OvhIncoming[]; state: PollerState }> {
  const overlapSeconds = options.overlapSeconds ?? DEFAULTS.overlapSeconds;
  const dedupeWindow = options.dedupeWindow ?? DEFAULTS.dedupeWindow;
  const coldStartSeconds = options.coldStartSeconds ?? DEFAULTS.coldStartSeconds;
  const maxReadAttempts = options.maxReadAttempts ?? DEFAULTS.maxReadAttempts;
  const now = options.now ?? Date.now;

  const fromMs =
    state.watermark === undefined
      ? now() - coldStartSeconds * 1000
      : Date.parse(state.watermark) - overlapSeconds * 1000;

  const ids = await listIncomingIds(client, serviceName, {
    from: new Date(fromMs).toISOString(),
  });

  const seen = new Set(state.seenIds);
  const fresh = ids.filter((id) => !seen.has(id));

  // Fetched one at a time because OVH exposes no batch read. Sequential rather
  // than concurrent: this runs on a loop against an API with no published rate
  // limit, and a burst of parallel reads is the kind of thing that gets an
  // account throttled.
  //
  // Each read is guarded on its own. Letting one throw out of this loop would
  // abandon the whole poll before the state is returned, so the failed id
  // would never be marked seen, the watermark would never advance, and the
  // next poll would list the same ids and throw on the same one. The channel
  // would stop delivering while still looking alive: one log line per cycle,
  // forever. A message deleted from the OVH manager between the list and the
  // read is enough to trigger it.
  const messages: OvhIncoming[] = [];
  const failures = { ...(state.failures ?? {}) };
  const abandoned: number[] = [];

  for (const id of fresh) {
    try {
      messages.push(await getIncoming(client, serviceName, id));
      delete failures[id];
    } catch (error) {
      const attempts = (failures[id] ?? 0) + 1;
      const reason = error instanceof Error ? error.message : String(error);
      if (attempts >= maxReadAttempts) {
        // Give up on this one so the queue behind it moves. Loud, because a
        // message addressed to someone is being dropped.
        delete failures[id];
        abandoned.push(id);
        options.log?.error?.(
          `message ${id} unreadable after ${attempts} attempts, abandoning it: ${reason}`,
        );
      } else {
        failures[id] = attempts;
        options.log?.warn?.(
          `message ${id} could not be read (attempt ${attempts}/${maxReadAttempts}), retrying next poll: ${reason}`,
        );
      }
    }
  }

  messages.sort((a, b) => Date.parse(a.creationDatetime) - Date.parse(b.creationDatetime));

  // Only ids that are done with count as seen: delivered, or abandoned. One
  // still being retried stays out, so the next poll picks it up again.
  const settled = [...messages.map((m) => m.id), ...abandoned];
  const nextSeen = [...state.seenIds, ...settled].slice(-dedupeWindow);
  const nextState: PollerState = { seenIds: nextSeen };
  // Drop counters for ids no longer in play, so a long-running gateway does
  // not accumulate them.
  const live = Object.fromEntries(Object.entries(failures).filter(([id]) => fresh.includes(Number(id))));
  if (Object.keys(live).length > 0) nextState.failures = live;

  // Advance the watermark only on real messages, so an empty poll cannot push
  // it forward past something that had not arrived yet.
  const newest = messages.at(-1);
  const candidate = newest?.creationDatetime ?? state.watermark;
  if (candidate !== undefined) nextState.watermark = candidate;

  return { messages, state: nextState };
}
