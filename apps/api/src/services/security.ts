import { isIP } from "node:net";
import { config } from "../config";

export type SecurityOptions = typeof config.security;

export class RequestProtectionError extends Error {
  constructor(readonly status: number, message: string, readonly retryAfter?: number) {
    super(message);
  }
}

/** Fixed windows with bounded memory. At capacity, fail closed rather than evict active limits. */
export class RateLimiter {
  private readonly entries = new Map<string, { count: number; expiresAt: number }>();
  constructor(private readonly maxKeys: number, private readonly now = Date.now) {}

  check(key: string, limit: number, windowMs: number) {
    const now = this.now();
    let entry = this.entries.get(key);
    if (entry && entry.expiresAt <= now) {
      this.entries.delete(key);
      entry = undefined;
    }
    if (!entry) {
      if (this.entries.size >= this.maxKeys) {
        for (const [key, value] of this.entries) {
          if (value.expiresAt <= now) this.entries.delete(key);
        }
      }
      if (this.entries.size >= this.maxKeys) {
        throw new RequestProtectionError(429, "Too many requests", 60);
      }
      entry = { count: 0, expiresAt: now + windowMs };
      this.entries.set(key, entry);
    }
    if (entry.count >= limit) {
      throw new RequestProtectionError(429, "Too many requests", Math.max(1, Math.ceil((entry.expiresAt - now) / 1000)));
    }
    entry.count++;
  }
}

function normalizeIp(ip: string) {
  return ip.startsWith("::ffff:") && isIP(ip.slice(7)) === 4 ? ip.slice(7) : ip;
}

export class Security {
  private readonly limiter: RateLimiter;
  private activeHashes = 0;
  private readonly trustedProxies: Set<string>;
  constructor(readonly options: SecurityOptions = config.security, now = Date.now) {
    this.limiter = new RateLimiter(options.maxRateLimitKeys, now);
    if (options.trustedProxyIps.some((ip) => !isIP(ip))) throw new Error("API_TRUSTED_PROXY_IPS must contain IP addresses");
    this.trustedProxies = new Set(options.trustedProxyIps.map(normalizeIp));
  }

  clientIp(request: Request, peer?: string) {
    if (!peer) return "unknown"; // app.handle() has no socket; never fall back to an untrusted header.
    const address = normalizeIp(peer);
    if (!this.trustedProxies.has(address)) return address;
    // Caddy appends the actual connecting client as the rightmost X-Forwarded-For entry.
    const forwarded = request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
    return forwarded && isIP(forwarded) ? normalizeIp(forwarded) : address;
  }

  bodyLimit(request: Request) {
    const path = new URL(request.url).pathname;
    return path.startsWith("/auth/") || path === "/vault" || path === "/vault/"
      ? Math.min(this.options.maxAuthBodyBytes, this.options.maxBodyBytes)
      : this.options.maxBodyBytes;
  }

  protect(request: Request, peer?: string) {
    const bytes = (value: string) => Buffer.byteLength(value, "utf8");
    if (bytes(request.url) > this.options.maxUrlBytes) throw new RequestProtectionError(414, "Request URL too long");
    let headerBytes = 0;
    for (const [name, value] of request.headers) {
      headerBytes += bytes(name) + bytes(value) + 4;
      if (bytes(value) > this.options.maxHeaderValueBytes || headerBytes > this.options.maxHeaderBytes) {
        throw new RequestProtectionError(431, "Request headers too large");
      }
    }
    const length = request.headers.get("content-length");
    if (length !== null) {
      if (!/^\d+$/.test(length)) throw new RequestProtectionError(400, "Invalid Content-Length");
      if (Number(length) > this.bodyLimit(request)) throw new RequestProtectionError(413, "Request body too large");
    }
    const encoding = request.headers.get("content-encoding");
    if (encoding && encoding.toLowerCase() !== "identity") throw new RequestProtectionError(415, "Encoded request bodies are not supported");
    const ip = this.clientIp(request, peer);
    this.limiter.check(`request:${ip}`, this.options.requestsPerMinute, 60_000);
    const path = new URL(request.url).pathname.replace(/\/$/, "");
    if (request.method === "POST" && (path === "/auth/login" || path === "/auth/register")) {
      this.limiter.check(`auth:${ip}`, this.options.authPerMinute, 60_000);
      if (path === "/auth/register") this.limiter.check(`register:${ip}`, this.options.registrationsPerHour, 3_600_000);
    }
  }

  checkLogin(email: string) {
    this.limiter.check(`account:${email}`, this.options.loginsPerAccountWindow, 15 * 60_000);
  }

  async withPasswordHash<T>(work: () => Promise<T>): Promise<T> {
    if (this.activeHashes >= this.options.maxConcurrentHashes) {
      throw new RequestProtectionError(503, "Authentication is busy; try again shortly", 1);
    }
    this.activeHashes++;
    try { return await work(); }
    finally { this.activeHashes--; }
  }

  /** Count actual stream bytes, not just Content-Length, before JSON parsing. */
  async parseJson(request: Request, contentType: string) {
    if (!request.body) return {};
    if (contentType !== "application/json") throw new RequestProtectionError(415, "Use application/json");
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > this.bodyLimit(request)) {
          await reader.cancel();
          throw new RequestProtectionError(413, "Request body too large");
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    if (total === 0) return {};
    try { return JSON.parse(Buffer.concat(chunks, total).toString("utf8")) as unknown; }
    catch { throw new RequestProtectionError(400, "Invalid JSON"); }
  }
}
