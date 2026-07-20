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

  await poll({
    account,
    abortSignal,
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
