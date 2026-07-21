import { describe, expect, it } from "vitest";

import { getOvhSmsRuntime, setOvhSmsRuntime, tryGetOvhSmsRuntime, type PluginRuntime } from "./runtime.js";

describe("the runtime store", () => {
  it("reports nothing before the plugin is registered", () => {
    expect(tryGetOvhSmsRuntime()).toBeNull();
  });

  it("throws a message that names the cause when read too early", () => {
    // Failing loudly matters here: the alternative is inbound SMS silently
    // going nowhere, which looks like a carrier problem rather than a bug.
    expect(() => getOvhSmsRuntime()).toThrowError(/not initialised|not registered/i);
  });

  it("returns the runtime once registration has happened", () => {
    const runtime = { channel: {} } as unknown as PluginRuntime;
    setOvhSmsRuntime(runtime);

    expect(getOvhSmsRuntime()).toBe(runtime);
    expect(tryGetOvhSmsRuntime()).toBe(runtime);
  });
});
