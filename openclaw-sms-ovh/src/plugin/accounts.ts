/**
 * Account configuration and resolution.
 *
 * Env fallbacks apply only to the default account, matching how OpenClaw's own
 * SMS plugin behaves: a named account must be configured explicitly, so adding
 * a second number cannot silently inherit the first one's credentials.
 */

import { z } from "zod";

import { DEFAULT_RATE_LIMITS, type RateLimitConfig } from "../filter/rate-limit.js";
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

/**
 * Forwarding notifications from the user's other channels to their phone.
 *
 * Off by default, and deliberately so. Every forwarded notification is an SMS
 * the user pays for, so this is the one part of the plugin that spends money
 * without anyone asking it a question.
 */
export const OvhSmsNotifySchema = z.object({
  enabled: z.boolean().optional(),
  /** The phone to push notifications to. Required once enabled. */
  to: z.string().optional(),
  /** Channels to watch. Empty means every channel except this one. */
  fromChannels: z.array(z.string()).optional(),
  /** How long to gather notifications before running the filter over them. */
  batchSeconds: z.number().int().positive().optional(),
  /** Flush early once this many have piled up. */
  maxBatch: z.number().int().positive().optional(),
  /** Model ref for the classifier and urgency stages. */
  model: z.string().optional(),
  /**
   * The spend controls. These are the knobs that decide the bill, so they are
   * user-facing rather than buried as constants.
   */
  limits: z
    .object({
      /** Minimum gap between two forwarded notifications. */
      cooldownSeconds: z.number().int().nonnegative().optional(),
      /** Cap per sender per hour. */
      perSenderHourly: z.number().int().positive().optional(),
      /** Window in which identical text is treated as a duplicate. */
      dedupeSeconds: z.number().int().nonnegative().optional(),
      /** Daily spend, in EUR, above which only critical messages pass. */
      softDailyBudget: z.number().nonnegative().optional(),
      /** Daily spend, in EUR, above which nothing passes. */
      hardDailyBudget: z.number().nonnegative().optional(),
    })
    .optional(),
});

export const DEFAULT_NOTIFY_BATCH_SECONDS = 15;
export const DEFAULT_NOTIFY_MAX_BATCH = 10;

export const OvhSmsAccountSchema = z.object({
  enabled: z.boolean().optional(),
  notify: OvhSmsNotifySchema.optional(),
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
  notify: ResolvedNotifyConfig;
}

export interface ResolvedNotifyConfig {
  enabled: boolean;
  to: string;
  fromChannels: string[];
  batchSeconds: number;
  maxBatch: number;
  model?: string;
  limits: RateLimitConfig;
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

  // Reject anything that is not shaped like a phone number, rather than
  // stripping it down until it looks like one. Stripping every non-digit meant
  // "33612345678xyz" normalised to "+33612345678", so an alphanumeric sender id
  // chosen to end in an allow-listed number passed the gate and earned a full
  // agent turn. OVH senders can be alphanumeric, so this input is attacker
  // controlled in practice, not hypothetical.
  //
  // Separators people actually type are allowed; letters are not, and `+` only
  // leads.
  if (!/^\+?[\d\s.\-/()  ]+$/.test(trimmed)) return "";

  // "+33 (0)6 12 34 56 78" is how a French number is printed on a business
  // card: the parenthesised zero is the trunk prefix you drop when calling from
  // abroad, so it must not survive into the digits.
  const withoutTrunkZero = trimmed.replace(/^(\+\d{1,3}[\s.\-/]*)\(0\)/, "$1");

  const digits = withoutTrunkZero.replace(/[^\d]/g, "");
  if (digits === "") return "";

  // 00 is the international prefix written the ITU way.
  const international = trimmed.startsWith("+")
    ? digits
    : digits.startsWith("00")
      ? digits.slice(2)
      : undefined;

  // A French national number written as 06... is the same as +336...
  const national =
    international === undefined && digits.startsWith("0") && digits.length === 10
      ? `33${digits.slice(1)}`
      : undefined;

  const e164 = international ?? national ?? digits;

  // E.164 allows 15 digits, and a country code plus subscriber number does not
  // get below 8 in practice. Outside that it is not a number we can match.
  if (e164.length < 8 || e164.length > 15) return "";

  return `+${e164}`;
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
    notify: resolveNotify(source.notify),
  };
}

function resolveNotify(source: z.infer<typeof OvhSmsNotifySchema> | undefined): ResolvedNotifyConfig {
  const model = source?.model;
  const limits = source?.limits;
  return {
    enabled: source?.enabled ?? false,
    to: normalizePhone(source?.to ?? ""),
    fromChannels: source?.fromChannels ?? [],
    batchSeconds: source?.batchSeconds ?? DEFAULT_NOTIFY_BATCH_SECONDS,
    maxBatch: source?.maxBatch ?? DEFAULT_NOTIFY_MAX_BATCH,
    ...(model === undefined ? {} : { model }),
    limits: {
      cooldownSeconds: limits?.cooldownSeconds ?? DEFAULT_RATE_LIMITS.cooldownSeconds,
      perSenderHourly: limits?.perSenderHourly ?? DEFAULT_RATE_LIMITS.perSenderHourly,
      dedupeSeconds: limits?.dedupeSeconds ?? DEFAULT_RATE_LIMITS.dedupeSeconds,
      softDailyBudget: limits?.softDailyBudget ?? DEFAULT_RATE_LIMITS.softDailyBudget,
      hardDailyBudget: limits?.hardDailyBudget ?? DEFAULT_RATE_LIMITS.hardDailyBudget,
    },
  };
}

/**
 * Whether the notification bridge should run.
 *
 * A destination is required rather than inferred from `allowFrom`. Guessing
 * which of several allowed numbers should receive a paid stream of alerts is
 * not a guess worth making.
 */
export function isNotifyEnabled(account: ResolvedOvhSmsAccount): boolean {
  return account.notify.enabled && account.notify.to !== "" && isConfigured(account);
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
