import { describe, expect, it, vi } from "vitest";

import type { PluginRuntime } from "../plugin/runtime.js";
import { createTextModel } from "./model.js";

function runtimeWith(complete: ReturnType<typeof vi.fn>): PluginRuntime {
  return { llm: { complete } } as unknown as PluginRuntime;
}

describe("createTextModel", () => {
  it("returns the completion text", async () => {
    const complete = vi.fn().mockResolvedValue({ text: "SEND" });
    const model = createTextModel({ runtime: runtimeWith(complete) });

    expect(await model("is this worth 0.12 EUR?")).toBe("SEND");
  });

  it("passes the prompt as a user message", async () => {
    const complete = vi.fn().mockResolvedValue({ text: "" });
    const model = createTextModel({ runtime: runtimeWith(complete) });

    await model("hello");

    expect(complete.mock.calls[0]?.[0]).toMatchObject({
      messages: [{ role: "user", content: "hello" }],
    });
  });

  it("asks for a deterministic answer, since this is a yes-or-no call", async () => {
    const complete = vi.fn().mockResolvedValue({ text: "" });
    await createTextModel({ runtime: runtimeWith(complete) })("x");

    expect(complete.mock.calls[0]?.[0]).toMatchObject({ temperature: 0 });
  });

  it("uses the configured model when one is given", async () => {
    const complete = vi.fn().mockResolvedValue({ text: "" });
    await createTextModel({ runtime: runtimeWith(complete), model: "anthropic/x" })("x");

    expect(complete.mock.calls[0]?.[0]).toMatchObject({ model: "anthropic/x" });
  });

  it("omits the model entirely when none is configured", async () => {
    // An explicit undefined would override the agent's own model choice.
    const complete = vi.fn().mockResolvedValue({ text: "" });
    await createTextModel({ runtime: runtimeWith(complete) })("x");

    expect(complete.mock.calls[0]?.[0]).not.toHaveProperty("model");
  });

  it("answers empty when the model call fails", async () => {
    // Every parser in the filter reads empty as no. Failing the other way would
    // turn an outage into an SMS bill.
    const warn = vi.fn();
    const complete = vi.fn().mockRejectedValue(new Error("provider down"));
    const model = createTextModel({ runtime: runtimeWith(complete), log: { warn } });

    expect(await model("x")).toBe("");
    expect(warn).toHaveBeenCalled();
  });
});
