/**
 * The plugin's handle on the OpenClaw runtime.
 *
 * The runtime arrives once, at registration, and is needed later on a code path
 * that never receives it: an inbound SMS surfaces inside a polling loop, not
 * inside a call the host made. `ChannelGatewayContext` does carry a
 * `channelRuntime`, but it is typed as an index signature, so reaching
 * `inbound.run` through it yields `unknown` and buys nothing. A module-scoped
 * store is what the bundled channels use, and it keeps the runtime typed.
 */

import {
  createPluginRuntimeStore,
  type PluginRuntime,
} from "openclaw/plugin-sdk/runtime-store";

import { CHANNEL_ID } from "./accounts.js";

const store = createPluginRuntimeStore<PluginRuntime>({
  pluginId: CHANNEL_ID,
  errorMessage:
    "sms-ovh runtime is not initialised, which means the plugin was never registered. " +
    "Inbound SMS cannot be delivered to an agent until it is.",
});

/** Called by the plugin entry at registration. */
export const setOvhSmsRuntime = store.setRuntime;

/** Throws if the plugin was never registered. */
export const getOvhSmsRuntime = store.getRuntime;

/** Returns null instead of throwing, for status checks that must not fail. */
export const tryGetOvhSmsRuntime = store.tryGetRuntime;

export type { PluginRuntime };
