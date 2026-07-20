/**
 * Attaching the bridge to OpenClaw's inbound hook.
 *
 * `message_received` is the only hook that fires for every channel rather than
 * just the plugin's own, which is what makes a cross-channel bridge possible at
 * all. It is not gated behind `allowConversationAccess`, so this needs no extra
 * grant in the user's config.
 *
 * Registration happens once, at plugin load, before any account is known to be
 * enabled. So the account is resolved per event from the current config rather
 * than captured here: turning notifications on should not require a restart.
 */

import {
  isNotifyEnabled,
  resolveAccount,
  type ResolvedOvhSmsAccount,
} from "../plugin/accounts.js";
import type { GatewayLogger } from "../plugin/gateway.js";
import type { PluginRuntime } from "../plugin/runtime.js";
import {
  createNotificationBridge,
  type InboundHookContext,
  type InboundHookEvent,
  type NotificationBridge,
} from "./bridge.js";
import { createTextModel } from "./model.js";
import { createSpendStore } from "./state.js";

export interface NotifyRouterParams {
  runtime: PluginRuntime;
  /** Reads the live config, so enabling notifications needs no restart. */
  readConfig: () => unknown;
  log?: GatewayLogger;
  /** Injected for tests. */
  createBridge?: typeof createNotificationBridge;
}

export interface NotifyRouter {
  handle: (event: InboundHookEvent, ctx: InboundHookContext) => void;
  /** Bridges built so far, keyed by account id. Exposed for tests. */
  bridges: Map<string, NotificationBridge>;
}

/**
 * Route every inbound event to the bridge for its account.
 *
 * One bridge per account, built lazily. Each holds its own batch buffer and its
 * own spend state, so two numbers cannot spend each other's budget.
 */
export function createNotifyRouter(params: NotifyRouterParams): NotifyRouter {
  const { runtime, readConfig, log } = params;
  const build = params.createBridge ?? createNotificationBridge;
  const bridges = new Map<string, NotificationBridge>();

  const bridgeFor = (account: ResolvedOvhSmsAccount): NotificationBridge => {
    const existing = bridges.get(account.accountId);
    if (existing !== undefined) return existing;

    const created = build({
      account,
      model: createTextModel({
        runtime,
        ...(account.notify.model === undefined ? {} : { model: account.notify.model }),
        ...(log === undefined ? {} : { log }),
      }),
      store: createSpendStore({
        runtime,
        accountId: account.accountId,
        ...(log === undefined ? {} : { log }),
      }),
      ...(log === undefined ? {} : { log }),
    });
    bridges.set(account.accountId, created);
    return created;
  };

  return {
    bridges,
    handle: (event, ctx) => {
      try {
        const cfg = readConfig();
        const account = resolveAccount(cfg, null);
        if (!isNotifyEnabled(account)) return;
        bridgeFor(account).handle(event, ctx);
      } catch (error) {
        log?.error?.(
          `notification routing failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    },
  };
}
