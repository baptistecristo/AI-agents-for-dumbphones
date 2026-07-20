/**
 * Account configuration and resolution.
 *
 * Env fallbacks apply only to the default account, matching how OpenClaw's own
 * SMS plugin behaves: a named account must be configured explicitly, so adding
 * a second number cannot silently inherit the first one's credentials.
 */

import { z } from "zod";

import type { OvhRegion } from "../ovh/client.js";

export const CHANNEL_ID = "sms-ovh";
export const DEFAULT_ACCOUNT_ID = "default";

/**
 * Chunk at a segment boundary, not at a readability boundary.
 *
 * OpenClaw's Twilio plugin defaults to 1500 characters, which is roughly ten
 * SMS segments. That is sensible when someone else is absorbing the per-segment
 * cost and the goal is a readable reply. Here the user pays per segment, so the
 * default is one concatenated GSM-7 segment: long replies still split, but the
 * split points line up with what is actually billed.
 */
export const DEFAULT_TEXT_CHUNK_LIMIT = 153;

export const DEFAULT_POLL_INTERVAL_SECONDS = 20;

/**
 * Ceiling on what a single agent reply may cost.
 *
 * Six segments is roughly 900 characters, which is a generous answer by SMS
 * standards and about 0.72 EUR on Time2Chat's two-credits-per-SMS rate. The
 * ceiling exists because the failure it guards against is not hypothetical: an
 * agent that answers at chat length turns one question into a bill.
 */
export const DEFAULT_MAX_REPLY_SEGMENTS = 6;

export const OvhSmsAccountSchema = z.object({
  enabled: z.boolean().optional(),
  applicationKey: z.string().optional(),
  applicationSecret: z.string().optional(),
  consumerKey: z.string().optional(),
  /** OVH SMS service name, e.g. "sms-ab12345-1". */
  serviceName: z.string().optional(),
  /**
   * The dedicated long number messages are sent from. Required for two-way
   * conversation: an alphanumeric sender cannot be replied to at all.
   */
  virtualNumber: z.string().optional(),
  region: z.enum(["eu", "ca", "us"]).optional(),
  pollIntervalSeconds: z.number().int().positive().optional(),
  textChunkLimit: z.number().int().positive().optional(),
  /** Most segments one agent reply may spend before it is cut short. */
  maxReplySegments: z.number().int().positive().optional(),
  /** Phone numbers permitted to talk to the agent. */
  allowFrom: z.array(z.string()).optional(),
  dmPolicy: z.enum(["open", "pairing", "closed"]).optional(),
});

export const OvhSmsChannelConfigSchema = OvhSmsAccountSchema.extend({
  accounts: z.record(z.string(), OvhSmsAccountSchema).optional(),
});

export type OvhSmsAccountConfig = z.infer<typeof OvhSmsAccountSchema>;
export type OvhSmsChannelConfig = z.infer<typeof OvhSmsChannelConfigSchema>;

export interface ResolvedOvhSmsAccount {
  accountId: string;
  enabled: boolean;
  applicationKey: string;
  applicationSecret: string;
  consumerKey: string;
  serviceName: string;
  virtualNumber: string;
  region: OvhRegion;
  pollIntervalSeconds: number;
  textChunkLimit: number;
  maxReplySegments: number;
  allowFrom: string[];
  dmPolicy: "open" | "pairing" | "closed";
}

function readChannelConfig(cfg: unknown): OvhSmsChannelConfig {
  const channels = (cfg as { channels?: Record<string, unknown> } | undefined)?.channels;
  const raw = channels?.[CHANNEL_ID];
  const parsed = OvhSmsChannelConfigSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : {};
}

export function listAccountIds(cfg: unknown): string[] {
  const channel = readChannelConfig(cfg);
  const named = Object.keys(channel.accounts ?? {});
  return named.length > 0 ? [DEFAULT_ACCOUNT_ID, ...named] : [DEFAULT_ACCOUNT_ID];
}

/**
 * Normalise to E.164-ish form: strip spaces and punctuation, keep a leading +.
 *
 * OVH returns senders in international format, but users write numbers with
 * spaces, and an allow-list that fails on "+33 6 12 34 56 78" is a support
 * burden nobody needs.
 */
export function normalizePhone(input: string): string {
  const trimmed = input.trim();
  const digits = trimmed.replace(/[^\d]/g, "");
  if (digits === "") return "";
  // A French national number written as 06... is the same as +336...
  if (!trimmed.startsWith("+") && digits.startsWith("0") && digits.length === 10) {
    return `+33${digits.slice(1)}`;
  }
  return trimmed.startsWith("+") ? `+${digits}` : `+${digits}`;
}

export function resolveAccount(cfg: unknown, accountId?: string | null): ResolvedOvhSmsAccount {
  const id = accountId ?? DEFAULT_ACCOUNT_ID;
  const channel = readChannelConfig(cfg);
  const named = id === DEFAULT_ACCOUNT_ID ? undefined : channel.accounts?.[id];
  const source: OvhSmsAccountConfig = named ?? channel;

  // Only the default account reads the environment.
  const env = id === DEFAULT_ACCOUNT_ID ? process.env : {};

  const region = (source.region ?? env["OVH_SMS_REGION"] ?? "eu") as OvhRegion;

  return {
    accountId: id,
    enabled: source.enabled ?? true,
    applicationKey: source.applicationKey ?? env["OVH_APPLICATION_KEY"] ?? "",
    applicationSecret: source.applicationSecret ?? env["OVH_APPLICATION_SECRET"] ?? "",
    consumerKey: source.consumerKey ?? env["OVH_CONSUMER_KEY"] ?? "",
    serviceName: source.serviceName ?? env["OVH_SMS_SERVICE_NAME"] ?? "",
    virtualNumber: source.virtualNumber ?? env["OVH_SMS_VIRTUAL_NUMBER"] ?? "",
    region,
    pollIntervalSeconds: source.pollIntervalSeconds ?? DEFAULT_POLL_INTERVAL_SECONDS,
    textChunkLimit: source.textChunkLimit ?? DEFAULT_TEXT_CHUNK_LIMIT,
    maxReplySegments: source.maxReplySegments ?? DEFAULT_MAX_REPLY_SEGMENTS,
    allowFrom: (source.allowFrom ?? []).map(normalizePhone).filter((n) => n !== ""),
    dmPolicy: source.dmPolicy ?? "pairing",
  };
}

export function isConfigured(account: ResolvedOvhSmsAccount): boolean {
  return (
    account.applicationKey !== "" &&
    account.applicationSecret !== "" &&
    account.consumerKey !== "" &&
    account.serviceName !== "" &&
    account.virtualNumber !== ""
  );
}

export function unconfiguredReason(): string {
  return (
    `${CHANNEL_ID} requires applicationKey, applicationSecret, consumerKey, ` +
    "serviceName and virtualNumber. The virtual number is what makes replies possible."
  );
}

export function inspectAccount(account: ResolvedOvhSmsAccount): Record<string, unknown> {
  return {
    enabled: account.enabled,
    configured: isConfigured(account),
    serviceName: account.serviceName,
    virtualNumber: account.virtualNumber,
    region: account.region,
    pollIntervalSeconds: account.pollIntervalSeconds,
    textChunkLimit: account.textChunkLimit,
    maxReplySegments: account.maxReplySegments,
    // Never echo the secret triple back.
    credentials: account.applicationKey === "" ? "missing" : "present",
  };
}
