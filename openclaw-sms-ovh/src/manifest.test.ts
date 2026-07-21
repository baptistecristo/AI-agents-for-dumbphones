import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { CHANNEL_ID, OvhSmsChannelConfigSchema } from "./plugin/accounts.js";

const manifest = JSON.parse(
  readFileSync(fileURLToPath(new URL("../openclaw.plugin.json", import.meta.url)), "utf8"),
) as {
  id: string;
  channels: string[];
  configSchema: unknown;
  channelConfigs?: Record<string, { schema?: unknown; uiHints?: Record<string, unknown> }>;
};

/**
 * OpenClaw reads `openclaw.plugin.json` to validate a user's config without
 * executing plugin code, so the manifest is a second copy of the schema. A copy
 * that drifts is worse than no copy: config the plugin accepts gets rejected
 * before it ever loads. These tests are the drift alarm.
 */
describe("the plugin manifest", () => {
  it("declares the channel, which is what marks it as owning one", () => {
    expect(manifest.channels).toContain(CHANNEL_ID);
  });

  it("carries a channelConfigs entry for the channel", () => {
    // Without this the host warns and the setup surfaces do not work.
    expect(manifest.channelConfigs?.[CHANNEL_ID]).toBeDefined();
  });

  it("keeps the manifest schema identical to the Zod schema", () => {
    const generated = z.toJSONSchema(OvhSmsChannelConfigSchema) as Record<string, unknown>;
    delete generated["$schema"];

    expect(manifest.channelConfigs?.[CHANNEL_ID]?.schema).toEqual(generated);
  });

  it("marks the credentials as sensitive so they are not echoed in a UI", () => {
    const hints = manifest.channelConfigs?.[CHANNEL_ID]?.uiHints ?? {};
    expect(hints["applicationSecret"]).toMatchObject({ sensitive: true });
    expect(hints["consumerKey"]).toMatchObject({ sensitive: true });
  });

  it("uses the same id the channel plugin registers", () => {
    expect(manifest.id).toBe(CHANNEL_ID);
  });
});
