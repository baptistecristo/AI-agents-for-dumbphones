import { describe, expect, it, vi } from "vitest";

import type { Notification } from "./rules.js";
import { checkUrgency, looksLikeGroup, parseUrgencyBatch } from "./urgency.js";

function note(overrides: Partial<Notification> = {}): Notification {
  return { app: "whatsapp", title: "Marie", body: "coucou", ...overrides };
}

describe("looksLikeGroup", () => {
  it("treats an explicit channel as a group", () => {
    expect(looksLikeGroup(note({ channel: "Famille" }))).toBe(true);
  });

  it("ignores an empty channel string", () => {
    expect(looksLikeGroup(note({ channel: "  " }))).toBe(false);
  });

  it("reads a comma-separated participant list as a group", () => {
    expect(looksLikeGroup(note({ title: "Marie, Paul, Luc" }))).toBe(true);
  });

  it("reads the tilde some clients prefix inside groups", () => {
    expect(looksLikeGroup(note({ title: "~Marie" }))).toBe(true);
  });

  it("leaves a plain one-to-one sender alone", () => {
    expect(looksLikeGroup(note())).toBe(false);
  });
});

describe("parseUrgencyBatch", () => {
  it("reads numbered verdicts", () => {
    const parsed = parseUrgencyBatch("1. NORMAL\n2. URGENT\n3. NORMAL", 3);
    expect(parsed.map((p) => p.urgent)).toEqual([false, true, false]);
  });

  it("tolerates punctuation and spacing variations", () => {
    const parsed = parseUrgencyBatch("1) URGENT\n 2 - normal \n3: URGENT", 3);
    expect(parsed.map((p) => p.urgent)).toEqual([true, false, true]);
  });

  it("pads missing lines as not urgent", () => {
    // The message stays dropped rather than being forwarded on a parse failure.
    const parsed = parseUrgencyBatch("1. URGENT", 3);
    expect(parsed.map((p) => p.urgent)).toEqual([true, false, false]);
    expect(parsed[1]?.reason).toContain("no verdict");
  });

  it("returns all-normal for unparseable output", () => {
    const parsed = parseUrgencyBatch("I could not classify these", 2);
    expect(parsed.map((p) => p.urgent)).toEqual([false, false]);
  });

  it("ignores stray numbers that are not verdicts", () => {
    const parsed = parseUrgencyBatch("Here are 2 results:\n1. NORMAL\n2. URGENT", 2);
    expect(parsed.map((p) => p.urgent)).toEqual([false, true]);
  });
});

describe("checkUrgency", () => {
  it("returns nothing for an empty list without calling the model", async () => {
    const model = vi.fn();
    expect(await checkUrgency(model, [])).toEqual([]);
    expect(model).not.toHaveBeenCalled();
  });

  it("answers group messages without consulting the model", async () => {
    const model = vi.fn();
    const results = await checkUrgency(model, [note({ channel: "Famille" })]);

    expect(results[0]?.urgent).toBe(false);
    expect(results[0]?.reason).toContain("group");
    expect(model).not.toHaveBeenCalled();
  });

  it("escalates a genuine emergency", async () => {
    const model = vi.fn().mockResolvedValue("1. URGENT");
    const results = await checkUrgency(model, [note({ body: "accident, call an ambulance" })]);
    expect(results[0]?.urgent).toBe(true);
  });

  it("batches many messages into one call", async () => {
    const model = vi.fn().mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => `${i + 1}. NORMAL`).join("\n"),
    );
    const notes = Array.from({ length: 10 }, (_, i) => note({ body: `message ${i}` }));

    await checkUrgency(model, notes);
    expect(model).toHaveBeenCalledTimes(1);
  });

  it("splits beyond the batch size into further calls", async () => {
    const model = vi.fn().mockResolvedValue("1. NORMAL\n2. NORMAL");
    const notes = Array.from({ length: 5 }, (_, i) => note({ body: `message ${i}` }));

    await checkUrgency(model, notes, { maxBatch: 2 });
    expect(model).toHaveBeenCalledTimes(3);
  });

  it("keeps results aligned when groups are interleaved with direct messages", async () => {
    // Only the two direct messages go to the model, but the returned array
    // must still line up with the input positions.
    const model = vi.fn().mockResolvedValue("1. NORMAL\n2. URGENT");
    const notes = [
      note({ title: "Marie", body: "direct one" }),
      note({ channel: "Famille", body: "group one" }),
      note({ title: "Paul", body: "direct two" }),
    ];

    const results = await checkUrgency(model, notes);
    expect(results.map((r) => r.urgent)).toEqual([false, false, true]);
    expect(results[1]?.reason).toContain("group");
  });

  it("keeps messages dropped when the model throws", async () => {
    const model = vi.fn().mockRejectedValue(new Error("timeout"));
    const results = await checkUrgency(model, [note()]);

    expect(results[0]?.urgent).toBe(false);
    expect(results[0]?.reason).toContain("timeout");
  });
});
