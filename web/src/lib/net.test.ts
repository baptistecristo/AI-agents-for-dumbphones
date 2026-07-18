import { describe, expect, it } from "vitest";
import { BlockedRequestError, assertAllowedUrl, isReservedAddress, redactUrl, safeFetch } from "./net";

// A resolver that answers with an ordinary public IP.
const publicResolve = async () => ["93.184.216.34"];

describe("assertAllowedUrl", () => {
  it("allows an allow-listed HTTPS host", () => {
    const url = assertAllowedUrl("https://api.open-meteo.com/v1/forecast?latitude=48&longitude=2");
    expect(url.hostname).toBe("api.open-meteo.com");
  });

  it("blocks a host that is not on the allow-list", () => {
    expect(() => assertAllowedUrl("https://evil.example.com/steal")).toThrow(BlockedRequestError);
  });

  it("blocks non-HTTPS schemes", () => {
    expect(() => assertAllowedUrl("http://api.open-meteo.com/")).toThrow(BlockedRequestError);
  });

  it("blocks the cloud metadata address before any allow-list check", () => {
    expect(() => assertAllowedUrl("https://169.254.169.254/latest/meta-data/")).toThrow(BlockedRequestError);
  });
});

describe("isReservedAddress", () => {
  it("flags private, loopback, link-local and internal names", () => {
    for (const h of [
      "127.0.0.1",
      "10.1.2.3",
      "192.168.0.5",
      "172.16.9.9",
      "169.254.169.254",
      "localhost",
      "foo.internal",
      "::1",
      "::ffff:127.0.0.1",
    ])
      expect(isReservedAddress(h)).toBe(true);
  });

  it("does not flag ordinary public hosts or IPs", () => {
    for (const h of ["api.open-meteo.com", "93.184.216.34", "8.8.8.8"]) expect(isReservedAddress(h)).toBe(false);
  });
});

describe("redactUrl", () => {
  it("masks secret query params and keeps the rest", () => {
    const red = redactUrl("https://api.openrouteservice.org/geocode/search?api_key=SECRET123&text=paris");
    expect(red).not.toContain("SECRET123");
    expect(red).toContain("api_key=***");
    expect(red).toContain("text=paris");
  });

  it("masks basic-auth userinfo", () => {
    const red = redactUrl("https://user:p4ssword@api.vapi.ai/call");
    expect(red).not.toContain("p4ssword");
  });
});

describe("safeFetch", () => {
  it("calls through to fetch for an allowed host that resolves to a public IP", async () => {
    let called: string | undefined;
    const fakeFetch = async (input: string | URL) => {
      called = String(input);
      return new Response("ok");
    };
    const res = await safeFetch("https://api.open-meteo.com/v1/forecast", undefined, {
      fetch: fakeFetch as typeof fetch,
      resolve: publicResolve,
    });
    expect(called).toContain("api.open-meteo.com");
    expect(await res.text()).toBe("ok");
  });

  it("blocks an allow-listed host that resolves to an internal IP (DNS-rebinding guard)", async () => {
    const rebind = async () => ["10.0.0.5"];
    const fakeFetch = async () => new Response("should not happen");
    await expect(
      safeFetch("https://api.open-meteo.com/v1/forecast", undefined, {
        fetch: fakeFetch as typeof fetch,
        resolve: rebind,
      }),
    ).rejects.toThrow(BlockedRequestError);
  });

  it("never reaches fetch for a blocked internal address", async () => {
    let called = false;
    const fakeFetch = async () => {
      called = true;
      return new Response("");
    };
    await expect(
      safeFetch("https://169.254.169.254/latest/", undefined, {
        fetch: fakeFetch as typeof fetch,
        resolve: publicResolve,
      }),
    ).rejects.toThrow(BlockedRequestError);
    expect(called).toBe(false);
  });
});
