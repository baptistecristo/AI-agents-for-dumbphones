/**
 * Minimal signed client for the OVHcloud API.
 *
 * Hand-rolled rather than using `@ovhcloud/node-ovh`: that package is CommonJS
 * with a callback API, has had one release since 2024, and pulls in an OAuth
 * dependency this does not use. The part that actually matters is about twenty
 * lines, and getting it wrong is easier to debug when it is visible.
 *
 * Schema: https://eu.api.ovh.com/1.0/sms.json
 * Signature: https://github.com/ovh/docs/blob/develop/pages/manage_and_operate/api/first-steps/guide.en-gb.md
 */

import { createHash } from "node:crypto";

export type OvhRegion = "eu" | "ca" | "us";

const ENDPOINTS: Record<OvhRegion, string> = {
  eu: "https://eu.api.ovh.com/1.0",
  ca: "https://ca.api.ovh.com/1.0",
  us: "https://api.us.ovhcloud.com/1.0",
};

export interface OvhCredentials {
  applicationKey: string;
  applicationSecret: string;
  consumerKey: string;
  region?: OvhRegion;
}

export interface OvhClientOptions {
  /** Injected for tests; defaults to the global fetch. */
  fetch?: typeof globalThis.fetch;
  /** Injected for tests; defaults to Date.now. */
  now?: () => number;
}

export class OvhApiError extends Error {
  constructor(
    readonly status: number,
    readonly method: string,
    readonly path: string,
    readonly body: string,
  ) {
    super(`OVH ${method} ${path} failed with ${status}: ${body}`);
    this.name = "OvhApiError";
  }
}

/**
 * Escape every non-ASCII character to a \\uXXXX sequence.
 *
 * This is not cosmetic. The signature is computed over the request body, so
 * the bytes signed and the bytes sent must be identical. `JSON.stringify`
 * emits raw UTF-8 for accented characters, and OVH's reference client escapes
 * them, so a message containing "é" fails signature validation unless both
 * sides agree. Escaping and then signing the escaped form is what their SDK
 * does, so it is what we do.
 *
 * Operates on UTF-16 code units, so an astral character becomes two escapes,
 * which is what JSON requires anyway.
 */
export function escapeNonAscii(json: string): string {
  let out = "";
  for (let i = 0; i < json.length; i++) {
    const code = json.charCodeAt(i);
    if (code < 0x80) {
      out += json.charAt(i);
      continue;
    }
    // Literal backslash-u, not a Unicode escape: we are producing the six
    // characters that JSON uses to represent this character.
    out += "\\u" + code.toString(16).padStart(4, "0");
  }
  return out;
}

/**
 * `$1$` + SHA-1 of six fields joined by a literal `+`.
 *
 * `url` must be the full absolute URL including any query string, not the path.
 */
export function signRequest(params: {
  applicationSecret: string;
  consumerKey: string;
  method: string;
  url: string;
  body: string;
  timestamp: number;
}): string {
  const joined = [
    params.applicationSecret,
    params.consumerKey,
    params.method.toUpperCase(),
    params.url,
    params.body,
    String(params.timestamp),
  ].join("+");
  return `$1$${createHash("sha1").update(joined, "utf8").digest("hex")}`;
}

export class OvhClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly now: () => number;
  /** serverTime - localTime, in seconds. Applied to every signed request. */
  private clockDriftSeconds = 0;
  private driftSynced = false;

  constructor(
    private readonly credentials: OvhCredentials,
    options: OvhClientOptions = {},
  ) {
    this.baseUrl = ENDPOINTS[credentials.region ?? "eu"];
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.now = options.now ?? Date.now;
  }

  /**
   * Align our clock with OVH's.
   *
   * Clock skew is the most common cause of INVALID_SIGNATURE, and a server
   * that has drifted by more than the tolerated window fails every call with
   * an error that says nothing about time. `/auth/time` is unauthenticated.
   */
  async syncTime(): Promise<void> {
    const response = await this.fetchImpl(`${this.baseUrl}/auth/time`, { method: "GET" });
    if (!response.ok) {
      throw new OvhApiError(response.status, "GET", "/auth/time", await response.text());
    }
    const serverTime = Number(await response.text());
    if (!Number.isFinite(serverTime)) {
      throw new Error("OVH /auth/time returned a non-numeric response");
    }
    this.clockDriftSeconds = serverTime - Math.floor(this.now() / 1000);
    this.driftSynced = true;
  }

  private timestamp(): number {
    return Math.floor(this.now() / 1000) + this.clockDriftSeconds;
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    // Sync once, lazily, so constructing a client costs nothing.
    if (!this.driftSynced) await this.syncTime();

    const url = `${this.baseUrl}${path}`;
    const serialized = body === undefined ? "" : escapeNonAscii(JSON.stringify(body));
    const timestamp = this.timestamp();

    const signature = signRequest({
      applicationSecret: this.credentials.applicationSecret,
      consumerKey: this.credentials.consumerKey,
      method,
      url,
      body: serialized,
      timestamp,
    });

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Ovh-Application": this.credentials.applicationKey,
      "X-Ovh-Consumer": this.credentials.consumerKey,
      "X-Ovh-Timestamp": String(timestamp),
      "X-Ovh-Signature": signature,
    };

    const init: RequestInit = { method, headers };
    // Send the escaped string verbatim: re-serializing here would produce
    // different bytes from the ones just signed.
    if (serialized !== "") init.body = serialized;

    const response = await this.fetchImpl(url, init);
    const text = await response.text();

    if (!response.ok) {
      throw new OvhApiError(response.status, method, path, text);
    }
    return (text === "" ? undefined : JSON.parse(text)) as T;
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("PUT", path, body);
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }
}
