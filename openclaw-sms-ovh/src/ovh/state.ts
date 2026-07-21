/**
 * Poller state that survives a restart.
 *
 * `pollIncoming` takes its state in and hands it back rather than holding it,
 * so the caller decides where it lives. Left in memory, `openclaw gateway
 * restart` cold-starts the poller, which re-lists up to `coldStartSeconds` of
 * inbound messages and delivers every one of them a second time. Each replay
 * is a full agent turn and an SMS reply the user pays for, to a message they
 * already had an answer to.
 *
 * Same shape as the notification spend store next door, for the same reason:
 * a store that throws must cost a restart's worth of de-duplication, never the
 * message being handled.
 */

import type { GatewayLogger } from "../plugin/gateway.js";
import type { PluginRuntime } from "../plugin/runtime.js";
import { emptyState, type PollerState } from "./poller.js";

const NAMESPACE = "sms-ovh-poller";

/**
 * One entry per account, and accounts are few. The same ceiling as the spend
 * store, so neither can grow without the other noticing.
 */
const MAX_ENTRIES = 16;

/** Reads and writes the poller state, degrading to memory if the store fails. */
export interface PollerStore {
  load: () => Promise<PollerState>;
  save: (state: PollerState) => Promise<void>;
}

export interface CreatePollerStoreParams {
  runtime: PluginRuntime;
  accountId: string;
  log?: GatewayLogger;
}

export function createPollerStore(params: CreatePollerStoreParams): PollerStore {
  const { runtime, accountId, log } = params;
  const key = `poller:${accountId}`;

  // Held alongside the store so a failing store degrades to in-memory rather
  // than losing de-duplication within one run, which would replay every
  // message on every poll rather than only after a restart.
  let cached: PollerState = emptyState();

  const store = runtime.state.openKeyedStore<PollerState>({
    namespace: NAMESPACE,
    maxEntries: MAX_ENTRIES,
  });

  return {
    load: async () => {
      try {
        const stored = await store.lookup(key);
        if (stored !== undefined) cached = stored;
      } catch (error) {
        log?.warn?.(
          `${accountId}: poller state unreadable, continuing from memory: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      return cached;
    },
    save: async (state: PollerState) => {
      cached = state;
      try {
        await store.register(key, state);
      } catch (error) {
        // A warning rather than a throw: losing persistence costs a replay on
        // the next restart, but throwing here would take the poll loop down.
        log?.warn?.(
          `${accountId}: poller state could not be saved: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    },
  };
}
