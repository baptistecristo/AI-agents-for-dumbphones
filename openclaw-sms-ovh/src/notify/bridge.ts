/**
 * Forwarding the user's other channels to their phone.
 *
 * OpenClaw fires `message_received` from the one dispatch path every channel
 * funnels through, so a plugin can watch traffic on channels it does not own.
 * That is the seam this bridge sits in: WhatsApp and Telegram arrive here, the
 * filter decides which of them are worth money, and the survivors go out as SMS.
 *
 * Two properties of that hook shape the code. It is fire-and-forget, so nothing
 * here may throw or the failure is swallowed silently. And it fires per message,
 * whereas the filter is built for batches, because its urgency stage costs one
 * model call per batch rather than per message. So messages are gathered for a
 * few seconds first. On a notification stream that delay is unnoticeable, and it
 * is the difference between one model call and ten.
 */

import { filterNotifications, type FilterOutcome } from "../filter/pipeline.js";
import { DEFAULT_CONFIG, type FilterConfig, type Notification } from "../filter/rules.js";
import type { RateLimitConfig, RateLimitState } from "../filter/rate-limit.js";
import type { TextModel } from "../filter/classifier.js";
import { CHANNEL_ID, type ResolvedOvhSmsAccount } from "../plugin/accounts.js";
import type { GatewayLogger } from "../plugin/gateway.js";
import { sendText } from "../plugin/send.js";
import type { SendTextFn } from "../plugin/inbound.js";
import type { SpendStore } from "./state.js";

/** The fields this bridge reads from OpenClaw's `message_received` event. */
export interface InboundHookEvent {
  from: string;
  content: string;
  timestamp?: number;
  senderId?: string;
}

/** The fields this bridge reads from the hook's message context. */
export interface InboundHookContext {
  channelId: string;
  accountId?: string;
  conversationId?: string;
}

/**
 * Decide whether an event on another channel should be bridged.
 *
 * The first rule is the one that matters: never bridge our own channel. Without
 * it, an SMS the user sends arrives as inbound, gets forwarded back to them as
 * an SMS, and the loop bills them for every lap.
 */
export function shouldBridge(account: ResolvedOvhSmsAccount, ctx: InboundHookContext): boolean {
  if (ctx.channelId === CHANNEL_ID) return false;
  const allowed = account.notify.fromChannels;
  return allowed.length === 0 || allowed.includes(ctx.channelId);
}

/**
 * Map a hook event onto the filter's notification shape.
 *
 * `channel` is set only when the conversation is identifiably not the sender,
 * because the urgency stage reads its presence as "this is a group" and
 * populating it for every direct message would make every message look like one.
 */
export function toNotification(event: InboundHookEvent, ctx: InboundHookContext): Notification {
  const title = event.from.trim() === "" ? (event.senderId ?? "unknown") : event.from;
  const conversation = ctx.conversationId;
  const isGroup =
    conversation !== undefined &&
    conversation !== "" &&
    conversation !== event.senderId &&
    conversation !== event.from;

  return {
    app: ctx.channelId,
    title,
    body: event.content,
    ...(isGroup ? { channel: conversation } : {}),
  };
}

export interface NotificationBridge {
  /** Hook entry point. Never throws and never returns a rejected promise. */
  handle: (event: InboundHookEvent, ctx: InboundHookContext) => void;
  /** Run the filter over whatever has been gathered. */
  flush: () => Promise<void>;
  /** Cancel the pending timer. */
  stop: () => void;
  /** Count waiting to be filtered, for tests and diagnostics. */
  pending: () => number;
}

export interface CreateNotificationBridgeParams {
  account: ResolvedOvhSmsAccount;
  model: TextModel;
  store: SpendStore;
  config?: FilterConfig;
  log?: GatewayLogger;
  /** Overrides the account's spend controls. Injected for tests. */
  limits?: RateLimitConfig;
  /** Injected for tests. */
  now?: () => number;
  /** Injected for tests. */
  send?: SendTextFn;
  /** Injected for tests. Returns a cancel function. */
  schedule?: (run: () => void, ms: number) => () => void;
}

function defaultSchedule(run: () => void, ms: number): () => void {
  const timer = setTimeout(run, ms);
  // Never hold the gateway open purely to flush notifications.
  timer.unref?.();
  return () => clearTimeout(timer);
}

export function createNotificationBridge(
  params: CreateNotificationBridgeParams,
): NotificationBridge {
  const { account, model, store, log } = params;
  const config = params.config ?? DEFAULT_CONFIG;
  const send = params.send ?? sendText;
  const schedule = params.schedule ?? defaultSchedule;

  let buffer: Notification[] = [];
  let cancelTimer: (() => void) | undefined;
  // Flushes are chained rather than run concurrently, so the spend state is
  // never read by one flush while another is writing it.
  let chain: Promise<void> = Promise.resolve();

  const clearTimer = (): void => {
    cancelTimer?.();
    cancelTimer = undefined;
  };

  const deliver = async (outcome: FilterOutcome): Promise<void> => {
    if (!outcome.forward || outcome.text === undefined) return;
    await send({ account, to: account.notify.to, text: outcome.text });
  };

  const runFlush = async (): Promise<void> => {
    const batch = buffer;
    buffer = [];
    if (batch.length === 0) return;

    let state: RateLimitState;
    try {
      state = await store.load();
    } catch {
      return;
    }

    const result = await filterNotifications(batch, state, {
      config,
      model,
      limits: params.limits ?? account.notify.limits,
      ...(params.now === undefined ? {} : { now: params.now }),
    });
    await store.save(result.state);

    let forwarded = 0;
    for (const outcome of result.outcomes) {
      if (!outcome.forward) continue;
      try {
        await deliver(outcome);
        forwarded += 1;
      } catch (error) {
        // One failed send must not strand the rest of the batch.
        log?.error?.(
          `notification send failed for ${outcome.notification.app}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    log?.info?.(`notifications: ${batch.length} seen, ${forwarded} forwarded`);
  };

  const flush = (): Promise<void> => {
    clearTimer();
    chain = chain.then(runFlush).catch((error: unknown) => {
      log?.error?.(
        `notification flush failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
    return chain;
  };

  return {
    handle: (event, ctx) => {
      try {
        if (!shouldBridge(account, ctx)) return;
        buffer.push(toNotification(event, ctx));

        if (buffer.length >= account.notify.maxBatch) {
          void flush();
          return;
        }
        if (cancelTimer === undefined) {
          cancelTimer = schedule(() => void flush(), account.notify.batchSeconds * 1000);
        }
      } catch (error) {
        // The hook is fire-and-forget: an escaping error would vanish.
        log?.error?.(
          `notification hook failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
    flush,
    stop: clearTimer,
    pending: () => buffer.length,
  };
}
