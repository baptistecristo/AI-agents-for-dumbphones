/**
 * Handing an inbound SMS to the agent.
 *
 * The poller in `../ovh/poller.ts` produces messages; this turns each one into
 * an OpenClaw turn and sends whatever the agent says back over the same number.
 *
 * The delivery adapter is where this channel differs from every chat channel in
 * OpenClaw. Elsewhere a long reply is a readability problem. Here each segment
 * is billed to the person who asked the question, so delivery carries a spend
 * ceiling and stops rather than sending an unbounded answer.
 */

import type { OpenClawConfig, ReplyPayload } from "openclaw/plugin-sdk/core";

import { analyze, truncateToSegments } from "../encoding.js";
import type { OvhIncoming } from "../ovh/sms.js";
import { CHANNEL_ID, normalizePhone, type ResolvedOvhSmsAccount } from "./accounts.js";
import type { GatewayLogger } from "./gateway.js";
import { getOvhSmsRuntime, type PluginRuntime } from "./runtime.js";
import { sendText, type SendTextResult } from "./send.js";

/** The subset of the send path that delivery needs, so tests can replace it. */
export type SendTextFn = (params: {
  account: ResolvedOvhSmsAccount;
  to: string;
  text: string;
}) => Promise<SendTextResult>;

/**
 * Structural shape of OpenClaw's delivery adapter.
 *
 * Written out rather than imported because the SDK does not export
 * `ChannelEventDeliveryAdapter` from any public entry point. Assignment to the
 * real type is still checked at the call site, so a drift in the contract
 * surfaces as a compile error rather than at runtime.
 */
export interface SmsDeliveryAdapter {
  deliver: (payload: ReplyPayload) => Promise<{
    visibleReplySent: boolean;
    messageIds?: string[];
  }>;
  onError?: (error: unknown, info: { kind: string }) => void;
}

export interface CreateSmsDeliveryParams {
  account: ResolvedOvhSmsAccount;
  to: string;
  log?: GatewayLogger;
  send?: SendTextFn;
}

/**
 * Build a delivery adapter that spends at most `maxReplySegments` on one turn.
 *
 * The budget is per turn, not per call: the reply pipeline hands over a block
 * at a time, so a counter that reset on each call would not cap anything. The
 * closure is created inside `resolveTurn`, which is what makes it per turn.
 *
 * When the budget runs out mid-reply the remainder is dropped and the last
 * message sent carries a truncation marker. Silently sending nothing would
 * leave someone staring at a phone waiting for an answer that is never coming.
 */
export function createSmsDelivery(params: CreateSmsDeliveryParams): SmsDeliveryAdapter {
  const { account, to, log } = params;
  const send = params.send ?? sendText;
  let spent = 0;

  return {
    deliver: async (payload) => {
      const text = payload.text?.trim() ?? "";
      if (text === "") return { visibleReplySent: false };

      const remaining = account.maxReplySegments - spent;
      if (remaining <= 0) {
        log?.warn?.(
          `${account.accountId}: reply budget of ${account.maxReplySegments} segments spent, ` +
            "dropping the rest of this turn",
        );
        return { visibleReplySent: false };
      }

      const body = analyze(text).segments > remaining ? truncateToSegments(text, remaining) : text;
      if (body !== text) {
        log?.warn?.(
          `${account.accountId}: reply cut to ${remaining} segment(s) to stay inside the budget`,
        );
      }

      const result = await send({ account, to, text: body });
      spent += result.segments;

      const messageIds = result.reports
        .flatMap((report) => report.ids ?? [])
        .map((id) => String(id));

      return {
        visibleReplySent: result.parts.length > 0,
        ...(messageIds.length > 0 ? { messageIds } : {}),
      };
    },
    onError: (error, info) => {
      log?.error?.(
        `${account.accountId}: delivery failed (${info.kind}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    },
  };
}

/** OVH timestamps are ISO strings; a malformed one must not sink the turn. */
export function inboundTimestamp(value: string): number | undefined {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export interface DispatchInboundSmsParams {
  cfg: OpenClawConfig;
  account: ResolvedOvhSmsAccount;
  message: OvhIncoming;
  log?: GatewayLogger;
  /** Injected for tests; defaults to the registered runtime. */
  runtime?: PluginRuntime;
  /** Injected for tests. */
  send?: SendTextFn;
}

/**
 * Run one inbound SMS through the agent and answer it.
 *
 * The sender's number is the conversation identity: on SMS there is no account,
 * no display name and no thread, so the number is all there is. That makes the
 * session key stable across messages from the same phone, which is what gives
 * the conversation continuity.
 */
export async function dispatchInboundSms(params: DispatchInboundSmsParams): Promise<void> {
  const { cfg, account, message, log } = params;
  const runtime = params.runtime ?? getOvhSmsRuntime();

  const from = normalizePhone(message.sender);
  const target = `${CHANNEL_ID}:${from}`;

  const route = runtime.channel.routing.resolveAgentRoute({
    cfg,
    channel: CHANNEL_ID,
    accountId: account.accountId,
    peer: { kind: "direct", id: from },
  });

  const storePath = runtime.channel.session.resolveStorePath(cfg.session?.store, {
    agentId: route.agentId,
  });

  const timestamp = inboundTimestamp(message.creationDatetime);

  await runtime.channel.inbound.run({
    channel: CHANNEL_ID,
    accountId: account.accountId,
    raw: message,
    adapter: {
      ingest: (raw: OvhIncoming) => ({
        // OVH ids are unique within a service, and a service belongs to one
        // account, so scoping by account makes the id unique gateway-wide.
        id: `${account.accountId}:${raw.id}`,
        ...(timestamp === undefined ? {} : { timestamp }),
        rawText: raw.message,
        textForAgent: raw.message,
        textForCommands: raw.message,
        raw,
      }),
      resolveTurn: (input) => {
        const ctxPayload = runtime.channel.inbound.buildContext({
          channel: CHANNEL_ID,
          accountId: account.accountId,
          messageId: String(message.id),
          ...(timestamp === undefined ? {} : { timestamp }),
          from: target,
          sender: { id: from },
          conversation: { kind: "direct", id: from, label: from },
          route: {
            agentId: route.agentId,
            accountId: account.accountId,
            routeSessionKey: route.sessionKey,
            dispatchSessionKey: route.sessionKey,
          },
          reply: { to: target },
          message: {
            rawBody: input.rawText,
            ...(input.textForAgent === undefined ? {} : { bodyForAgent: input.textForAgent }),
            ...(input.textForCommands === undefined ? {} : { commandBody: input.textForCommands }),
          },
        });

        return {
          cfg,
          channel: CHANNEL_ID,
          accountId: account.accountId,
          agentId: route.agentId,
          routeSessionKey: route.sessionKey,
          storePath,
          ctxPayload,
          recordInboundSession: runtime.channel.session.recordInboundSession,
          dispatchReplyWithBufferedBlockDispatcher:
            runtime.channel.reply.dispatchReplyWithBufferedBlockDispatcher,
          delivery: createSmsDelivery({
            account,
            to: from,
            ...(log === undefined ? {} : { log }),
            ...(params.send === undefined ? {} : { send: params.send }),
          }),
          messageId: String(message.id),
        };
      },
    },
  });
}
