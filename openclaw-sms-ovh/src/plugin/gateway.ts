/**
 * The account lifecycle: a polling loop instead of a webhook route.
 *
 * OpenClaw's Twilio SMS plugin registers an HTTP route and waits to be called.
 * This cannot, for the reasons set out in `../ovh/poller.ts`: OVH's inbound
 * callback is unauthenticated and its wire format is undocumented. So the
 * gateway hook starts a loop that pulls, and the plugin needs no public
 * ingress at all.
 *
 * That is a real advantage for the intended user. A self-hosted agent on a
 * laptop or a home server does not need a tunnel, a public hostname or a
 * certificate to receive messages.
 */

import { OvhClient } from "../ovh/client.js";
import { emptyState, pollIncoming, type PollerState } from "../ovh/poller.js";
import type { OvhIncoming } from "../ovh/sms.js";
import { normalizePhone, type ResolvedOvhSmsAccount } from "./accounts.js";

export interface GatewayLogger {
  info?: (message: string) => void;
  warn?: (message: string) => void;
  error?: (message: string) => void;
}

/** Called for each inbound message. Returning text sends a reply. */
export type InboundHandler = (message: OvhIncoming) => Promise<void>;

export interface StartAccountParams {
  account: ResolvedOvhSmsAccount;
  onMessage: InboundHandler;
  abortSignal?: AbortSignal;
  log?: GatewayLogger;
  client?: OvhClient;
  /** Injected for tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Injected for tests: stop after this many iterations. */
  maxIterations?: number;
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

/**
 * Decide whether a sender may talk to the agent.
 *
 * An empty allow-list with a `closed` policy refuses everyone, which is the
 * safe reading of "no one is allowed yet". Under `open` it admits anyone,
 * which is only sensible for a number nobody knows.
 */
export function isSenderAllowed(account: ResolvedOvhSmsAccount, sender: string): boolean {
  if (account.dmPolicy === "open") return true;
  const normalized = normalizePhone(sender);
  return account.allowFrom.includes(normalized);
}

/**
 * Poll for inbound messages until aborted.
 *
 * Errors are logged and retried rather than thrown: a transient OVH outage or
 * a network blip must not take the channel down until the gateway restarts.
 * The loop keeps its poller state across iterations, so a failed poll does not
 * lose or replay messages.
 */
export async function runPollLoop(params: StartAccountParams): Promise<void> {
  const { account, abortSignal, log } = params;
  const sleep = params.sleep ?? ((ms: number) => defaultSleep(ms, abortSignal));
  const intervalMs = account.pollIntervalSeconds * 1000;

  const client =
    params.client ??
    new OvhClient({
      applicationKey: account.applicationKey,
      applicationSecret: account.applicationSecret,
      consumerKey: account.consumerKey,
      region: account.region,
    });

  // Read through a function so narrowing does not collapse the mid-loop
  // check: abort can flip while a handler is awaited.
  const aborted = (): boolean => abortSignal?.aborted === true;

  let state: PollerState = emptyState();
  let iterations = 0;

  log?.info?.(
    `${account.accountId}: polling ${account.serviceName} every ${account.pollIntervalSeconds}s`,
  );

  while (!aborted()) {
    if (params.maxIterations !== undefined && iterations >= params.maxIterations) break;
    iterations += 1;

    try {
      const result = await pollIncoming(client, account.serviceName, state);
      state = result.state;

      for (const message of result.messages) {
        if (!isSenderAllowed(account, message.sender)) {
          log?.warn?.(`${account.accountId}: ignored message from ${message.sender} (not allowed)`);
          continue;
        }
        try {
          await params.onMessage(message);
        } catch (error) {
          // One bad message must not stop the others behind it.
          log?.error?.(
            `${account.accountId}: handler failed for message ${message.id}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    } catch (error) {
      log?.error?.(
        `${account.accountId}: poll failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    if (aborted()) break;
    await sleep(intervalMs);
  }

  log?.info?.(`${account.accountId}: polling stopped`);
}
