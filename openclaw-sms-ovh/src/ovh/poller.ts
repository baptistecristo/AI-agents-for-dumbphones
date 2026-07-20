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
  /** Injected for tests. */
  now?: () => number;
}

const DEFAULTS = {
  overlapSeconds: 120,
  dedupeWindow: 500,
  coldStartSeconds: 300,
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
  const messages: OvhIncoming[] = [];
  for (const id of fresh) {
    messages.push(await getIncoming(client, serviceName, id));
  }

  messages.sort((a, b) => Date.parse(a.creationDatetime) - Date.parse(b.creationDatetime));

  const nextSeen = [...state.seenIds, ...fresh].slice(-dedupeWindow);
  const nextState: PollerState = { seenIds: nextSeen };

  // Advance the watermark only on real messages, so an empty poll cannot push
  // it forward past something that had not arrived yet.
  const newest = messages.at(-1);
  const candidate = newest?.creationDatetime ?? state.watermark;
  if (candidate !== undefined) nextState.watermark = candidate;

  return { messages, state: nextState };
}
