/**
 * The gateway lifecycle hook.
 *
 * `startAccount` must not resolve until the account is shutting down: resolving
 * early is how a channel tells the supervisor it died. The polling loop already
 * runs until its abort signal fires, so awaiting it is the whole lifecycle; the
 * trailing `waitUntilAbort` is a guard for the case where the loop ever exits
 * for a reason other than abort.
 *
 * An account that is disabled or unconfigured also waits rather than returning.
 * Returning would look like a crash and earn a restart loop, when the truthful
 * state is "there is nothing to do here until the config changes".
 */

import { waitUntilAbort } from "openclaw/plugin-sdk/channel-lifecycle";

import {
  isConfigured,
  unconfiguredReason,
  type ResolvedOvhSmsAccount,
} from "./accounts.js";
import { runPollLoop, type GatewayLogger } from "./gateway.js";
import { dispatchInboundSms } from "./inbound.js";
import { tryGetOvhSmsRuntime } from "./runtime.js";
import { createPollerStore, type PollerStore } from "../ovh/state.js";
import type { OvhIncoming } from "../ovh/sms.js";
import type { OpenClawConfig } from "openclaw/plugin-sdk/core";

/** The part of `ChannelGatewayContext` this hook actually uses. */
export interface StartAccountContext {
  cfg: OpenClawConfig;
  accountId: string;
  account: ResolvedOvhSmsAccount;
  abortSignal: AbortSignal;
  log?: GatewayLogger;
}

export interface StartAccountDeps {
  /** Injected for tests. */
  poll?: typeof runPollLoop;
  /** Injected for tests. */
  dispatch?: typeof dispatchInboundSms;
  /** Injected for tests. Built from the plugin runtime otherwise. */
  store?: PollerStore;
}

/**
 * Where this account's poller state is kept.
 *
 * Returns nothing when the runtime is missing, which means the plugin was
 * never registered. The loop still runs; it just cold-starts on every restart
 * and replays whatever that window catches, so it is worth saying out loud.
 */
function storeFor(accountId: string, log?: GatewayLogger): PollerStore | undefined {
  const runtime = tryGetOvhSmsRuntime();
  if (runtime === null) {
    log?.warn?.(
      `${accountId}: no plugin runtime, so poller state cannot be saved and a ` +
        "restart will re-deliver recent messages",
    );
    return undefined;
  }
  return createPollerStore({ runtime, accountId, ...(log === undefined ? {} : { log }) });
}

export async function startAccount(
  ctx: StartAccountContext,
  deps: StartAccountDeps = {},
): Promise<unknown> {
  const { cfg, account, abortSignal, log } = ctx;
  const poll = deps.poll ?? runPollLoop;
  const dispatch = deps.dispatch ?? dispatchInboundSms;

  if (!account.enabled) {
    log?.info?.(`${account.accountId}: disabled, not polling`);
    return waitUntilAbort(abortSignal);
  }

  if (!isConfigured(account)) {
    log?.warn?.(`${account.accountId}: ${unconfiguredReason()}`);
    return waitUntilAbort(abortSignal);
  }

  const store = deps.store ?? storeFor(account.accountId, log);

  await poll({
    account,
    abortSignal,
    ...(store === undefined ? {} : { store }),
    ...(log === undefined ? {} : { log }),
    onMessage: async (message: OvhIncoming) => {
      await dispatch({
        cfg,
        account,
        message,
        ...(log === undefined ? {} : { log }),
      });
    },
  });

  return waitUntilAbort(abortSignal);
}
