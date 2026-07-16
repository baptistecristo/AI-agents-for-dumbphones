import { describe, expect, it } from "vitest";
import { buildDigestEmail } from "./digest";

const row = (over: Partial<Parameters<typeof buildDigestEmail>[0][number]> = {}) => ({
  id: "1",
  created_at: "2026-07-16T09:00:00Z",
  request_summary: "check live train times",
  caller_words: null,
  language: "en",
  notify_caller: false,
  ...over,
});

describe("buildDigestEmail", () => {
  it("summarizes the count and embeds each fix-prompt", () => {
    const { subject, text } = buildDigestEmail([row(), row({ id: "2", request_summary: "order a pizza" })]);
    expect(subject).toContain("2 capability gaps");
    expect(text).toContain("check live train times");
    expect(text).toContain("order a pizza");
    expect(text).toContain("CONTRIBUTING.md"); // the fix-prompt is inlined
  });

  it("uses the singular and flags a caller waiting for an SMS", () => {
    const { subject, text } = buildDigestEmail([row({ notify_caller: true })]);
    expect(subject).toContain("1 capability gap");
    expect(subject).not.toContain("gaps");
    expect(text).toContain("caller is waiting");
  });
});
