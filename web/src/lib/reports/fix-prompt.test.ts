import { describe, expect, it } from "vitest";
import { buildFixPrompt } from "./fix-prompt";

describe("buildFixPrompt", () => {
  it("includes the request summary and the repo touch points", () => {
    const p = buildFixPrompt({ request_summary: "check live train departure times" });
    expect(p).toContain("check live train departure times");
    expect(p).toContain("CONTRIBUTING.md");
    expect(p).toContain("web/src/lib/skills/index.ts");
    expect(p).toContain("web/src/lib/agents/tools.ts");
    expect(p).toContain("web/src/lib/skills/gate.ts");
  });

  it("includes caller words when present and omits the line when absent", () => {
    expect(buildFixPrompt({ request_summary: "x", caller_words: "can you book me a train" })).toContain(
      "book me a train",
    );
    expect(buildFixPrompt({ request_summary: "x" })).not.toContain("What the caller actually said");
  });
});
