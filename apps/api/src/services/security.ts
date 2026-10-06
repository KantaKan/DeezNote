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

  check(key: string, limit: number, windowMs: number, cost = 1) {
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
    if (entry.count + cost > limit) {
      throw new RequestProtectionError(429, "Too many requests", Math.max(1, Math.ceil((entry.expiresAt - now) / 1000)));
    }
    entry.count += cost;
  }
}

function normalizeIp(ip: string) {
  return ip.startsWith("::ffff:") && isIP(ip.slice(7)) === 4 ? ip.slice(7) : ip;
}

/** Rate-limit key for an address: IPv6 is grouped by /64, since one client usually controls a whole /64. */
export function rateLimitKey(ip: string) {
  if (isIP(ip) !== 6) return ip;
  const [head, tail = ""] = ip.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = ip.includes("::") ? [...left, ...Array(8 - left.length - right.length).fill("0"), ...right] : left;
  return `${groups.slice(0, 4).map((group) => (Number.parseInt(group, 16) || 0).toString(16)).join(":")}::/64`;
}

function ipv4ToNumber(ip: string) {
  return ip.split(".").reduce((value, octet) => value * 256 + Number(octet), 0);
}

/**
 * A trusted-proxy entry: an exact IP, or an IPv4 range such as "172.16.0.0/12". Ranges exist because
 * Docker reassigns Caddy's container IP when it is recreated; the API itself is only reachable from
 * Docker networks (bound to the bridge IP, firewalled), so trusting Docker's private range is safe there.
 */
function parseTrustedProxy(entry: string): (ip: string) => boolean {
  const [base, bits, ...rest] = entry.split("/");
  if (bits === undefined) {
    if (!isIP(entry)) throw new Error("API_TRUSTED_PROXY_IPS must contain IP addresses or IPv4 ranges");
    const exact = normalizeIp(entry);
    return (ip) => ip === exact;
  }
  const prefix = Number(bits);
  if (rest.length || isIP(base) !== 4 || !/^\d{1,2}$/.test(bits) || prefix < 8 || prefix > 32) {
    throw new Error("API_TRUSTED_PROXY_IPS ranges must be IPv4 with a /8 to /32 prefix");
  }
  const size = 2 ** (32 - prefix);
  const start = Math.floor(ipv4ToNumber(base) / size) * size;
  return (ip) => isIP(ip) === 4 && ipv4ToNumber(ip) >= start && ipv4ToNumber(ip) < start + size;
}

export class Security {
  private readonly limiter: RateLimiter;
  private activeHashes = 0;
  private readonly bodyBytes = new WeakMap<Request, number>();
  private readonly trustedProxies: Array<(ip: string) => boolean>;
  constructor(readonly options: SecurityOptions = config.security, now = Date.now) {
    this.limiter = new RateLimiter(options.maxRateLimitKeys, now);
    this.trustedProxies = options.trustedProxyIps.map(parseTrustedProxy);
  }

  clientIp(request: Request, peer?: string) {
    if (!peer) return "unknown"; // app.handle() has no socket; never fall back to an untrusted header.
    const address = normalizeIp(peer);
    if (!this.trustedProxies.some((matches) => matches(address))) return address;
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
    const ip = rateLimitKey(this.clientIp(request, peer));
    this.limiter.check(`request:${ip}`, this.options.requestsPerMinute, 60_000);
    const path = new URL(request.url).pathname.replace(/\/$/, "");
    if (request.method === "POST" && (path === "/auth/login" || path === "/auth/register" || path === "/auth/delete-account")) {
      this.limiter.check(`auth:${ip}`, this.options.authPerMinute, 60_000);
      if (path === "/auth/register") this.limiter.check(`register:${ip}`, this.options.registrationsPerHour, 3_600_000);
    }
  }

  checkLogin(email: string) {
    this.limiter.check(`account:${email}`, this.options.loginsPerAccountWindow, 15 * 60_000);
  }

  checkNoteWrite(userId: string, request: Request) {
    // Account ID, not IP or session token: all devices/sessions share these budgets.
    this.limiter.check(`note-write:${userId}`, this.options.noteWritesPerMinute, 60_000);
    const bytes = this.bodyBytes.get(request) ?? 0;
    if (bytes > 0) this.limiter.check(`note-upload:${userId}`, this.options.noteUploadBytesPerMinute, 60_000, bytes);
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
    this.bodyBytes.set(request, total);
    if (total === 0) return {};
    try { return JSON.parse(Buffer.concat(chunks, total).toString("utf8")) as unknown; }
    catch { throw new RequestProtectionError(400, "Invalid JSON"); }
  }
}
