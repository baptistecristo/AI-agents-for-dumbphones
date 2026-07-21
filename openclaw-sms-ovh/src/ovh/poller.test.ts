import { describe, expect, it } from "vitest";

import type { OvhClient } from "./client.js";
import { emptyState, pollIncoming, type PollerState } from "./poller.js";
import type { OvhIncoming } from "./sms.js";

const SERVICE = "sms-ab12345-1";
const T0 = Date.parse("2026-07-20T12:00:00.000Z");

function msg(id: number, offsetSeconds: number, overrides: Partial<OvhIncoming> = {}): OvhIncoming {
  return {
    id,
    sender: "+33612345678",
    message: `message ${id}`,
    creationDatetime: new Date(T0 + offsetSeconds * 1000).toISOString(),
    credits: 1,
    tag: "",
    ...overrides,
  };
}

/** Stands in for OvhClient, honouring the creationDatetime.from filter. */
function fakeClient(inbox: OvhIncoming[]) {
  const queries: string[] = [];
  const client = {
    get: async (path: string) => {
      queries.push(path);
      const marker = "/incoming/";
      if (path.includes(marker)) {
        const id = Number(path.slice(path.indexOf(marker) + marker.length));
        return inbox.find((m) => m.id === id);
      }
      const query = path.includes("?") ? path.slice(path.indexOf("?") + 1) : "";
      const from = new URLSearchParams(query).get("creationDatetime.from");
      return inbox
        .filter((m) => from === null || Date.parse(m.creationDatetime) >= Date.parse(from))
        .map((m) => m.id);
    },
  } as unknown as OvhClient;
  return { client, queries };
}

describe("pollIncoming", () => {
  it("returns nothing and holds the watermark when the inbox is empty", async () => {
    const { client } = fakeClient([]);
    const result = await pollIncoming(client, SERVICE, emptyState(), { now: () => T0 });

    expect(result.messages).toEqual([]);
    expect(result.state.watermark).toBeUndefined();
  });

  it("looks back only a bounded window on a cold start", async () => {
    // A six-month-old message must not be replayed to the user on first run.
    const old = msg(1, -60 * 60 * 24 * 30);
    const recent = msg(2, -30);
    const { client } = fakeClient([old, recent]);

    const result = await pollIncoming(client, SERVICE, emptyState(), {
      now: () => T0,
      coldStartSeconds: 300,
    });

    expect(result.messages.map((m) => m.id)).toEqual([2]);
  });

  it("advances the watermark to the newest message handled", async () => {
    const { client } = fakeClient([msg(1, -60), msg(2, -30)]);
    const result = await pollIncoming(client, SERVICE, emptyState(), {
      now: () => T0,
      coldStartSeconds: 300,
    });

    expect(result.state.watermark).toBe(msg(2, -30).creationDatetime);
  });

  it("does not return the same message twice across polls", async () => {
    const inbox = [msg(1, -60), msg(2, -30)];
    const { client } = fakeClient(inbox);

    const first = await pollIncoming(client, SERVICE, emptyState(), {
      now: () => T0,
      coldStartSeconds: 300,
    });
    expect(first.messages.map((m) => m.id)).toEqual([1, 2]);

    // Second poll re-queries the overlap window and must suppress both.
    const second = await pollIncoming(client, SERVICE, first.state, { now: () => T0 });
    expect(second.messages).toEqual([]);
  });

  it("picks up a message that arrives inside the overlap window", async () => {
    // Timestamped BEFORE the watermark but listed after it: the exact case the
    // overlap exists to catch. A watermark-only poller would lose this forever.
    const inbox = [msg(1, -30)];
    const { client } = fakeClient(inbox);

    const first = await pollIncoming(client, SERVICE, emptyState(), {
      now: () => T0,
      coldStartSeconds: 300,
    });
    expect(first.messages.map((m) => m.id)).toEqual([1]);

    inbox.push(msg(2, -45));
    const second = await pollIncoming(client, SERVICE, first.state, {
      now: () => T0,
      overlapSeconds: 120,
    });
    expect(second.messages.map((m) => m.id)).toEqual([2]);
  });

  it("does not depend on ids increasing monotonically", async () => {
    // OVH never documents id ordering, so a lower id arriving later must work.
    const inbox = [msg(500, -60)];
    const { client } = fakeClient(inbox);

    const first = await pollIncoming(client, SERVICE, emptyState(), {
      now: () => T0,
      coldStartSeconds: 300,
    });
    expect(first.messages.map((m) => m.id)).toEqual([500]);

    inbox.push(msg(7, -20));
    const second = await pollIncoming(client, SERVICE, first.state, { now: () => T0 });
    expect(second.messages.map((m) => m.id)).toEqual([7]);
  });

  it("returns messages oldest first so a conversation reads in order", async () => {
    const { client } = fakeClient([msg(3, -10), msg(1, -90), msg(2, -50)]);
    const result = await pollIncoming(client, SERVICE, emptyState(), {
      now: () => T0,
      coldStartSeconds: 300,
    });

    expect(result.messages.map((m) => m.id)).toEqual([1, 2, 3]);
  });

  it("bounds the de-duplication set so it cannot grow without limit", async () => {
    const inbox = Array.from({ length: 20 }, (_, i) => msg(i + 1, -100 + i));
    const { client } = fakeClient(inbox);

    const result = await pollIncoming(client, SERVICE, emptyState(), {
      now: () => T0,
      coldStartSeconds: 300,
      dedupeWindow: 5,
    });

    expect(result.messages).toHaveLength(20);
    expect(result.state.seenIds).toHaveLength(5);
    // Keeps the most recent ids, which are the ones the overlap can re-list.
    expect(result.state.seenIds).toEqual([16, 17, 18, 19, 20]);
  });

  it("queries from the watermark minus the overlap, not from the watermark", async () => {
    const { client, queries } = fakeClient([msg(1, -30)]);
    const first = await pollIncoming(client, SERVICE, emptyState(), {
      now: () => T0,
      coldStartSeconds: 300,
    });

    queries.length = 0;
    await pollIncoming(client, SERVICE, first.state, { now: () => T0, overlapSeconds: 120 });

    const listQuery = queries.find((q) => q.includes("creationDatetime.from"));
    const from = new URLSearchParams(listQuery?.split("?")[1] ?? "").get("creationDatetime.from");
    const watermark = Date.parse(first.state.watermark ?? "");
    expect(Date.parse(from ?? "")).toBe(watermark - 120_000);
  });

  it("carries the watermark forward when a poll returns nothing new", async () => {
    const { client } = fakeClient([msg(1, -30)]);
    const first = await pollIncoming(client, SERVICE, emptyState(), {
      now: () => T0,
      coldStartSeconds: 300,
    });
    const second = await pollIncoming(client, SERVICE, first.state, { now: () => T0 });

    expect(second.state.watermark).toBe(first.state.watermark);
  });

  it("survives a restart that lost the state without replaying history", async () => {
    const inbox = [msg(1, -60 * 60 * 24), msg(2, -10)];
    const { client } = fakeClient(inbox);

    const cold: PollerState = emptyState();
    const result = await pollIncoming(client, SERVICE, cold, {
      now: () => T0,
      coldStartSeconds: 300,
    });

    expect(result.messages.map((m) => m.id)).toEqual([2]);
  });
});

/**
 * Like fakeClient, but reading the ids in `broken` throws. Models a message
 * deleted from the OVH manager between the list and the read, or a transient
 * 500 on a single read.
 */
function brokenClient(inbox: OvhIncoming[], broken: Set<number>) {
  const reads: number[] = [];
  const base = fakeClient(inbox);
  const client = {
    get: async (path: string) => {
      const marker = "/incoming/";
      if (path.includes(marker)) {
        const id = Number(path.slice(path.indexOf(marker) + marker.length));
        reads.push(id);
        if (broken.has(id)) throw new Error(`OVH GET /incoming/${id} failed with 404: not found`);
      }
      return (base.client as unknown as { get: (p: string) => Promise<unknown> }).get(path);
    },
  } as unknown as OvhClient;
  return { client, reads };
}

describe("pollIncoming, when a message cannot be read", () => {
  const inbox = [msg(1, 0), msg(2, 10), msg(3, 20)];

  it("delivers the messages behind the broken one instead of losing the poll", async () => {
    const { client } = brokenClient(inbox, new Set([2]));
    const result = await pollIncoming(client, SERVICE, emptyState(), { now: () => T0 });

    expect(result.messages.map((m) => m.id)).toEqual([1, 3]);
  });

  it("leaves a failed id unseen so the next poll tries it again", async () => {
    const { client } = brokenClient(inbox, new Set([2]));
    const result = await pollIncoming(client, SERVICE, emptyState(), { now: () => T0 });

    expect(result.state.seenIds).not.toContain(2);
    expect(result.state.failures).toEqual({ 2: 1 });
  });

  it("delivers the message once the failure clears", async () => {
    const broken = new Set([2]);
    const { client } = brokenClient(inbox, broken);
    const first = await pollIncoming(client, SERVICE, emptyState(), { now: () => T0 });
    expect(first.messages.map((m) => m.id)).toEqual([1, 3]);

    broken.delete(2); // the blip passes
    const second = await pollIncoming(client, SERVICE, first.state, { now: () => T0 });

    expect(second.messages.map((m) => m.id)).toEqual([2]);
    expect(second.state.failures).toBeUndefined();
  });

  // The bug this guards: without a per-read guard the poll threw before
  // returning state, so the same id was re-listed and re-thrown every cycle
  // and nothing behind it was ever delivered.
  it("abandons an id that never reads, and keeps polling afterwards", async () => {
    const { client } = brokenClient(inbox, new Set([2]));
    const errors: string[] = [];
    const opts = { now: () => T0, maxReadAttempts: 3, log: { error: (m: string) => errors.push(m) } };

    let state: PollerState = emptyState();
    for (let poll = 0; poll < 3; poll++) {
      state = (await pollIncoming(client, SERVICE, state, opts)).state;
    }

    expect(state.seenIds).toContain(2);
    expect(state.failures).toBeUndefined();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("abandoning it");

    // A later message still arrives: the channel is not wedged.
    const after = await pollIncoming(client, SERVICE, state, {
      ...opts,
      // A new message lands after the watermark.
    });
    expect(after.messages).toEqual([]);
    expect(after.state.seenIds).toContain(2);
  });

  it("still advances the watermark from the messages that did read", async () => {
    const { client } = brokenClient(inbox, new Set([2]));
    const result = await pollIncoming(client, SERVICE, emptyState(), { now: () => T0 });

    expect(result.state.watermark).toBe(msg(3, 20).creationDatetime);
  });
});
