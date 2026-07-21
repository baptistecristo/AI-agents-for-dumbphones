/**
 * Spend state that survives a restart.
 *
 * The daily budget is the reason this is not just held in memory. A gateway
 * that restarts twice in an evening with in-memory state grants itself three
 * daily budgets, which turns the one control that caps real money into
 * decoration. OpenClaw gives plugins a keyed store, so the state lives there.
 */

import { emptyRateLimitState, type RateLimitState } from "../filter/rate-limit.js";
import type { GatewayLogger } from "../plugin/gateway.js";
import type { PluginRuntime } from "../plugin/runtime.js";

const NAMESPACE = "sms-ovh-notify";
const MAX_ENTRIES = 16;

/** Reads and writes the spend state, degrading to memory if the store fails. */
export interface SpendStore {
  load: () => Promise<RateLimitState>;
  save: (state: RateLimitState) => Promise<void>;
}

export interface CreateSpendStoreParams {
  runtime: PluginRuntime;
  accountId: string;
  log?: GatewayLogger;
}

export function createSpendStore(params: CreateSpendStoreParams): SpendStore {
  const { runtime, accountId, log } = params;
  const key = `rate-limit:${accountId}`;

  // Held alongside the store so a failing store degrades to in-memory rather
  // than losing the budget entirely within one run.
  let cached: RateLimitState = emptyRateLimitState();

  const store = runtime.state.openKeyedStore<RateLimitState>({
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
          `notification spend state unreadable, continuing from memory: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      return cached;
    },
    save: async (state: RateLimitState) => {
      cached = state;
      try {
        await store.register(key, state);
      } catch (error) {
        // Worth a warning rather than a throw: losing persistence costs a
        // budget reset on restart, but throwing here would lose the SMS too.
        log?.warn?.(
          `notification spend state could not be saved: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    },
  };
}
