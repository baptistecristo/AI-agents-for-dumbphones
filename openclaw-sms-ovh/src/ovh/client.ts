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
  /**
   * How long a single call may take before it is aborted, in milliseconds.
   *
   * This runs as a daemon on someone's own machine, so a connection that hangs
   * hangs the poll loop with it: no messages in, none out, and nothing in the
   * log to say why. Node's fetch has no default timeout of its own.
   */
  timeoutMs?: number;
  /**
   * How long a clock sync stays good, in milliseconds.
   *
   * Syncing once at startup is not enough for a process meant to run for
   * weeks on a laptop that sleeps: the local clock drifts, every call starts
   * failing with INVALID_SIGNATURE, and nothing recovers it short of a
   * restart.
   */
  resyncAfterMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RESYNC_AFTER_MS = 60 * 60 * 1000;

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

/**
 * Does this error mean OVH refused the signature?
 *
 * 403 with INVALID_SIGNATURE is what a drifted clock produces. Matching on the
 * code rather than the status alone keeps an ordinary permission error, also a
 * 403, from triggering a pointless resync and retry.
 */
function isSignatureRejection(error: unknown): boolean {
  return (
    error instanceof OvhApiError &&
    error.status === 403 &&
    /INVALID_SIGNATURE/i.test(error.body)
  );
}

export class OvhClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly now: () => number;
  private readonly timeoutMs: number;
  private readonly resyncAfterMs: number;
  /** serverTime - localTime, in seconds. Applied to every signed request. */
  private clockDriftSeconds = 0;
  /** When the drift above was measured, by the local clock. */
  private driftSyncedAt: number | undefined;
  /** In-flight sync, so concurrent callers wait on one request. */
  private syncing: Promise<void> | undefined;

  constructor(
    private readonly credentials: OvhCredentials,
    options: OvhClientOptions = {},
  ) {
    this.baseUrl = ENDPOINTS[credentials.region ?? "eu"];
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.now = options.now ?? Date.now;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.resyncAfterMs = options.resyncAfterMs ?? DEFAULT_RESYNC_AFTER_MS;
  }

  /** Wraps fetch so no single call can hang the loop it runs in. */
  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetchImpl(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Align our clock with OVH's.
   *
   * Clock skew is the most common cause of INVALID_SIGNATURE, and a server
   * that has drifted by more than the tolerated window fails every call with
   * an error that says nothing about time. `/auth/time` is unauthenticated.
   */
  async syncTime(): Promise<void> {
    // One request even if several calls race into this at startup.
    if (this.syncing !== undefined) return this.syncing;
    this.syncing = (async () => {
      try {
        const response = await this.fetchWithTimeout(`${this.baseUrl}/auth/time`, { method: "GET" });
        if (!response.ok) {
          throw new OvhApiError(response.status, "GET", "/auth/time", await response.text());
        }
        const serverTime = Number(await response.text());
        if (!Number.isFinite(serverTime)) {
          throw new Error("OVH /auth/time returned a non-numeric response");
        }
        this.clockDriftSeconds = serverTime - Math.floor(this.now() / 1000);
        this.driftSyncedAt = this.now();
      } finally {
        this.syncing = undefined;
      }
    })();
    return this.syncing;
  }

  /** True once the last sync is old enough to be worth redoing. */
  private driftIsStale(): boolean {
    return this.driftSyncedAt === undefined || this.now() - this.driftSyncedAt >= this.resyncAfterMs;
  }

  private timestamp(): number {
    return Math.floor(this.now() / 1000) + this.clockDriftSeconds;
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    // Lazily, so constructing a client costs nothing, and again once the last
    // sync has aged out.
    if (this.driftIsStale()) await this.syncTime();

    try {
      return await this.send<T>(method, path, body);
    } catch (error) {
      // A signature rejection is what clock drift looks like from here: OVH
      // says nothing about time, it just refuses. Re-syncing and retrying once
      // turns a gateway that would stay dead until someone restarted it into
      // one that recovers on its own. Only once, so a genuinely bad key fails
      // fast instead of doubling every call.
      if (!isSignatureRejection(error)) throw error;
      await this.syncTime();
      return this.send<T>(method, path, body);
    }
  }

  private async send<T>(method: string, path: string, body?: unknown): Promise<T> {
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

    const response = await this.fetchWithTimeout(url, init);
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
