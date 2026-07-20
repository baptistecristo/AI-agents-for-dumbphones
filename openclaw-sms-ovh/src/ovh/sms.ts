/**
 * Typed wrappers over the OVHcloud /sms routes.
 *
 * Field names and enums are taken from https://eu.api.ovh.com/1.0/sms.json
 * rather than from prose documentation, which is thinner and in places wrong.
 */

import type { OvhClient } from "./client.js";

export type OvhSenderType = "alpha" | "numeric" | "shortcode" | "time2chat" | "virtual";

/** `sms.Incoming`. There is no read/unread flag; see `listIncomingIds`. */
export interface OvhIncoming {
  id: number;
  sender: string;
  message: string;
  /** ISO 8601, OVH's clock. */
  creationDatetime: string;
  credits: number;
  tag: string;
}

/** `sms.SmsSendingReportUser`. `creditsLeft` is absent on the virtual-number route. */
export interface OvhSendReport {
  ids: number[];
  validReceivers: string[];
  invalidReceivers: string[];
  totalCreditsRemoved: number;
  creditsLeft?: number;
  tag?: string;
}

/** `sms.JobEstimate`. */
export interface OvhJobEstimate {
  characters: number;
  charactersClass: "7bits" | "unicode";
  parts: number;
  maxCharactersPerPart: number;
}

export interface OvhSender {
  sender: string;
  type: OvhSenderType;
  status: string;
  description?: string;
}

/**
 * A Time2Chat message costs two credits to send, not one.
 *
 * This is the single most expensive fact about the product and it appears only
 * in the Time2Chat guide, not in the API schema, so it is easy to budget at
 * half the real price.
 */
export const TIME2CHAT_CREDITS_PER_SMS = 2;
export const STANDARD_CREDITS_PER_SMS = 1;

/** OVH refuses to concatenate beyond six segments. */
export const MAX_SEGMENTS = 6;

export interface SendOptions {
  message: string;
  /** International format, e.g. "+33612345678". */
  receivers: string[];
  tag?: string;
  priority?: "high" | "medium" | "low" | "veryLow";
  /** Minutes before an undelivered message is abandoned. */
  validityPeriod?: number;
  /** Minutes to hold the message before sending. */
  differedPeriod?: number;
}

export interface AccountSendOptions extends SendOptions {
  /** A declared sender. If alphanumeric, the recipient cannot reply at all. */
  sender?: string;
  /**
   * Ask OVH to allocate a random 5-digit short number the recipient can reply
   * to. Mutually exclusive with `sender`. The number is per-conversation and
   * not retained, so it is unsuitable for an ongoing assistant.
   */
  senderForResponse?: boolean;
  /**
   * Drop the "STOP au XXXXX" suffix. Permitted only for non-advertising
   * traffic. A conversational assistant replying to a user-initiated message
   * is transactional, so this is both legal and worth the saved characters.
   */
  noStopClause?: boolean;
}

export async function listServices(client: OvhClient): Promise<string[]> {
  return client.get<string[]>("/sms");
}

export async function listSenders(client: OvhClient, serviceName: string): Promise<string[]> {
  return client.get<string[]>(`/sms/${encodeURIComponent(serviceName)}/senders`);
}

export async function getSender(
  client: OvhClient,
  serviceName: string,
  sender: string,
): Promise<OvhSender> {
  return client.get<OvhSender>(
    `/sms/${encodeURIComponent(serviceName)}/senders/${encodeURIComponent(sender)}`,
  );
}

export async function listVirtualNumbers(
  client: OvhClient,
  serviceName: string,
): Promise<string[]> {
  return client.get<string[]>(`/sms/${encodeURIComponent(serviceName)}/virtualNumbers`);
}

/**
 * Send from a dedicated long number, which is what makes replies possible.
 *
 * This route deliberately has no `sender`, `senderForResponse` or
 * `noStopClause` field: the number in the path is the identity, and the
 * channel is conversational by construction.
 */
export async function sendFromVirtualNumber(
  client: OvhClient,
  serviceName: string,
  virtualNumber: string,
  options: SendOptions,
): Promise<OvhSendReport> {
  const body: Record<string, unknown> = {
    message: options.message,
    receivers: options.receivers,
    charset: "UTF-8",
  };
  if (options.tag !== undefined) body["tag"] = options.tag;
  if (options.priority !== undefined) body["priority"] = options.priority;
  if (options.validityPeriod !== undefined) body["validityPeriod"] = options.validityPeriod;
  if (options.differedPeriod !== undefined) body["differedPeriod"] = options.differedPeriod;

  return client.post<OvhSendReport>(
    `/sms/${encodeURIComponent(serviceName)}/virtualNumbers/${encodeURIComponent(
      virtualNumber,
    )}/jobs`,
    body,
  );
}

/** Send at account level. Use only when no dedicated number is available. */
export async function sendFromAccount(
  client: OvhClient,
  serviceName: string,
  options: AccountSendOptions,
): Promise<OvhSendReport> {
  if (options.sender !== undefined && options.senderForResponse === true) {
    throw new Error("`sender` and `senderForResponse` are mutually exclusive");
  }

  const body: Record<string, unknown> = {
    message: options.message,
    receivers: options.receivers,
    charset: "UTF-8",
  };
  if (options.sender !== undefined) body["sender"] = options.sender;
  if (options.senderForResponse !== undefined) {
    body["senderForResponse"] = options.senderForResponse;
  }
  if (options.noStopClause !== undefined) body["noStopClause"] = options.noStopClause;
  if (options.tag !== undefined) body["tag"] = options.tag;
  if (options.priority !== undefined) body["priority"] = options.priority;
  if (options.validityPeriod !== undefined) body["validityPeriod"] = options.validityPeriod;
  if (options.differedPeriod !== undefined) body["differedPeriod"] = options.differedPeriod;

  return client.post<OvhSendReport>(`/sms/${encodeURIComponent(serviceName)}/jobs`, body);
}

/**
 * OVH's own segment arithmetic.
 *
 * `encoding.ts` computes the same thing locally and for free, which is what
 * the notification filter uses on every message. This exists to confirm the
 * local model against the party that actually does the billing, not to be
 * called per message.
 */
export async function estimate(
  client: OvhClient,
  params: { message: string; noStopClause: boolean; senderType: OvhSenderType },
): Promise<OvhJobEstimate> {
  return client.post<OvhJobEstimate>("/sms/estimate", params);
}

export interface IncomingQuery {
  /** ISO 8601. Inclusive lower bound on `creationDatetime`. */
  from?: string;
  to?: string;
  sender?: string;
  tag?: string;
}

/**
 * List inbound message ids.
 *
 * OVH exposes no read/unread flag and no acknowledge endpoint, so a consumer
 * must either delete messages after handling them or keep its own high-water
 * mark. `IncomingPoller` does the latter, which is non-destructive and leaves
 * the six-month history intact.
 */
export async function listIncomingIds(
  client: OvhClient,
  serviceName: string,
  query: IncomingQuery = {},
): Promise<number[]> {
  const params = new URLSearchParams();
  if (query.from !== undefined) params.set("creationDatetime.from", query.from);
  if (query.to !== undefined) params.set("creationDatetime.to", query.to);
  if (query.sender !== undefined) params.set("sender", query.sender);
  if (query.tag !== undefined) params.set("tag", query.tag);

  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  return client.get<number[]>(`/sms/${encodeURIComponent(serviceName)}/incoming${suffix}`);
}

export async function getIncoming(
  client: OvhClient,
  serviceName: string,
  id: number,
): Promise<OvhIncoming> {
  return client.get<OvhIncoming>(`/sms/${encodeURIComponent(serviceName)}/incoming/${id}`);
}

export async function deleteIncoming(
  client: OvhClient,
  serviceName: string,
  id: number,
): Promise<void> {
  await client.delete<void>(`/sms/${encodeURIComponent(serviceName)}/incoming/${id}`);
}
