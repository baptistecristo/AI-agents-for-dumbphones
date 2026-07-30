import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted : la fabrique vi.mock ne voit rien d'autre.
const h = vi.hoisted(() => ({ calls: [] as string[], reply: null as unknown }));

vi.mock("../net", () => ({
  safeFetch: async (url: string) => {
    h.calls.push(url);
    return {
      ok: h.reply !== null,
      json: async () => h.reply,
    } as Response;
  },
}));

import { getCurrentTime } from "./time";
import type { CallSession } from "./types";

const session = (language: "fr" | "en" | "es" = "fr"): CallSession =>
  ({
    callId: "c1",
    channel: "voice",
    direction: "inbound",
    userId: null,
    callerNumber: null,
    verified: false,
    trustedCaller: false,
    language,
  }) as CallSession;

const geocoded = (timezone: string, name = "Tokyo") => ({ results: [{ name, timezone }] });

beforeEach(() => {
  h.calls = [];
  h.reply = geocoded("Asia/Tokyo");
});

describe("getCurrentTime", () => {
  it("asks which city when none was given", async () => {
    expect(await getCurrentTime(session(), {})).toBe("Pour quelle ville ?");
    expect(h.calls).toHaveLength(0);
  });

  // Le skill appelait worldtimeapi.org juste pour savoir l'heure qu'il est.
  // Ce service a refusé la connexion TLS le 30/07/2026 et le skill est tombé
  // avec lui, alors que le fuseau suffisait.
  it("reads the clock without a second network call", async () => {
    const answer = await getCurrentTime(session(), { city: "Tokyo" });

    expect(h.calls).toHaveLength(1);
    expect(h.calls[0]).toContain("geocoding-api.open-meteo.com");
    expect(answer).toMatch(/^À Tokyo, il est \d{1,2}:\d{2}\.$/);
  });

  it("gives the time of the requested zone, not of the server", async () => {
    h.reply = geocoded("Pacific/Kiritimati", "Kiritimati");
    const east = await getCurrentTime(session(), { city: "Kiritimati" });
    h.reply = geocoded("Pacific/Midway", "Midway");
    const west = await getCurrentTime(session(), { city: "Midway" });

    // Les deux fuseaux sont à 26 h d'écart : la même horloge serveur ne peut
    // pas produire la même heure pour les deux.
    expect(east).not.toBe(west);
  });

  it("answers in the caller's language", async () => {
    expect(await getCurrentTime(session("en"), { city: "Tokyo" })).toContain("In Tokyo, it's ");
    expect(await getCurrentTime(session("es"), { city: "Tokyo" })).toContain("En Tokyo son las ");
  });

  it("says so when the city is unknown", async () => {
    h.reply = { results: [] };
    expect(await getCurrentTime(session(), { city: "Zzz" })).toContain("Je ne trouve pas la ville");
  });

  it("survives a time zone Intl does not know", async () => {
    // Open-Meteo rend des noms IANA, mais c'est une donnée tierce : un fuseau
    // inventé ferait lever un RangeError au milieu du formatage.
    h.reply = geocoded("Mars/Olympus_Mons", "Olympus");
    expect(await getCurrentTime(session(), { city: "Olympus" })).toContain(
      "Je ne connais pas le fuseau horaire",
    );
  });

  it("reports the outage when the geocoder is down", async () => {
    h.reply = null;
    expect(await getCurrentTime(session(), { city: "Tokyo" })).toContain(
      "Le service de recherche de ville ne répond pas",
    );
  });
});
