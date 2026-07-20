/**
 * OpenClaw channel plugin: two-way SMS over OVHcloud.
 *
 * Why this exists: OpenClaw's official SMS channel is Twilio-only, and Twilio
 * sells only mobile numbers in France, which is the one tier French regulation
 * gives no automated-messaging derogation to. So the channel that could reach a
 * basic phone is precisely the one that cannot be used here. This plugin routes
 * SMS over an OVHcloud dedicated long number instead, which can.
 *
 * The intended shape is that the user runs their own gateway and their own
 * number. Nothing here relays through a third party, and no operator credential
 * for anyone's gateway is held anywhere.
 */

import {
  defineChannelPluginEntry,
  type ChannelPlugin,
  type OpenClawPluginApi,
} from "openclaw/plugin-sdk/channel-core";
import { z } from "zod";

import {
  CHANNEL_ID,
  DEFAULT_TEXT_CHUNK_LIMIT,
  inspectAccount,
  isConfigured,
  listAccountIds,
  normalizePhone,
  OvhSmsChannelConfigSchema,
  resolveAccount,
  unconfiguredReason,
  type ResolvedOvhSmsAccount,
} from "./plugin/accounts.js";
import { createNotifyRouter } from "./notify/register.js";
import { setOvhSmsRuntime } from "./plugin/runtime.js";
import { sendText as deliverText } from "./plugin/send.js";
import { startAccount } from "./plugin/start.js";

export * from "./encoding.js";
export * from "./filter/pipeline.js";
export * from "./filter/rules.js";
export * from "./ovh/client.js";
export * from "./ovh/poller.js";
export * from "./ovh/sms.js";
export * from "./plugin/accounts.js";
export * from "./plugin/gateway.js";
export * from "./notify/bridge.js";
export * from "./notify/model.js";
export * from "./notify/register.js";
export * from "./notify/state.js";
export * from "./plugin/inbound.js";
export * from "./plugin/runtime.js";
export * from "./plugin/send.js";
export * from "./plugin/start.js";

const LOOKS_LIKE_PHONE = /^\+?[\d\s().-]{6,}$/;

export const ovhSmsPlugin: ChannelPlugin<ResolvedOvhSmsAccount> = {
  id: CHANNEL_ID,
  meta: {
    id: CHANNEL_ID,
    label: "SMS (OVH)",
    selectionLabel: "SMS (OVHcloud)",
    detailLabel: "OVHcloud SMS",
    blurb: "Two-way SMS over an OVHcloud dedicated number. Polls, so it needs no public URL.",
    docsPath: "/channels/sms-ovh",
    docsLabel: "sms-ovh",
    order: 89,
  },
  capabilities: {
    chatTypes: ["direct"],
    media: false,
    threads: false,
    reactions: false,
    edit: false,
    unsend: false,
    reply: false,
    effects: false,
    blockStreaming: false,
  },
  config: {
    listAccountIds,
    resolveAccount,
    inspectAccount: (cfg: unknown, accountId?: string | null) =>
      inspectAccount(resolveAccount(cfg, accountId)),
    isEnabled: (account: ResolvedOvhSmsAccount) => account.enabled,
    isConfigured: (account: ResolvedOvhSmsAccount) => isConfigured(account),
    unconfiguredReason,
  },
  // The SDK wants JSON Schema here, so the Zod schema is converted rather
  // than duplicated: one definition stays the source of truth.
  configSchema: { schema: z.toJSONSchema(OvhSmsChannelConfigSchema) as Record<string, unknown> },
  reload: { configPrefixes: [`channels.${CHANNEL_ID}`] },
  messaging: {
    targetPrefixes: ["sms-ovh"],
    normalizeTarget: (target: string) => normalizePhone(target),
    targetResolver: {
      looksLikeId: (value: string) => LOOKS_LIKE_PHONE.test(value.trim()),
      hint: "<+33612345678>",
    },
  },
  gateway: {
    startAccount: (ctx) => startAccount(ctx),
  },
  outbound: {
    deliveryMode: "gateway",
    // Chunk where the money is, not where the prose is. The reply pipeline
    // splits before delivery ever sees the text, so this is what decides how
    // many segments an answer costs.
    textChunkLimit: DEFAULT_TEXT_CHUNK_LIMIT,
    sendText: async (ctx) => {
      const account = resolveAccount(ctx.cfg, ctx.accountId);
      const result = await deliverText({
        account,
        to: normalizePhone(ctx.to),
        text: ctx.text,
      });
      // OVH returns one job id per message. No id means nothing was queued,
      // which is a failed send however cheerful the HTTP status was.
      const firstId = result.reports[0]?.ids?.[0];
      if (firstId === undefined) {
        throw new Error("OVH accepted the request but returned no SMS job id");
      }
      return { channel: CHANNEL_ID, messageId: String(firstId) };
    },
  },
};

/**
 * Structural type for the entry object.
 *
 * Written out rather than inferred because the inferred type names internal
 * SDK chunk modules, which cannot be referenced from an emitted declaration.
 */
export interface OvhSmsChannelEntry {
  id: string;
  name: string;
  description: string;
  register: (api: OpenClawPluginApi) => void;
  channelPlugin: ChannelPlugin<ResolvedOvhSmsAccount>;
}

const entry: OvhSmsChannelEntry = defineChannelPluginEntry({
  id: CHANNEL_ID,
  name: "SMS (OVH)",
  description: "Two-way SMS over an OVHcloud dedicated long number.",
  plugin: ovhSmsPlugin,
  // The runtime arrives here and is needed later inside the polling loop, on a
  // path the host never calls into. See `plugin/runtime.ts`.
  setRuntime: setOvhSmsRuntime,
  // `message_received` is the one hook that fires for every channel rather than
  // only this plugin's own, which is what lets the bridge watch WhatsApp and
  // Telegram at all. Registered here because `registerFull` runs with the whole
  // runtime available, unlike setup-only registration.
  registerFull: (api) => {
    const router = createNotifyRouter({
      runtime: api.runtime,
      // Read through the runtime rather than closing over `api.config`, which
      // is a snapshot taken at load. Enabling notifications should not need a
      // gateway restart.
      readConfig: () => api.runtime.config.current(),
      log: api.logger,
    });
    api.on("message_received", (event, ctx) => {
      router.handle(event, ctx);
    });
  },
});

export default entry;
