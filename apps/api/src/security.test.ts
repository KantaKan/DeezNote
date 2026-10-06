import { describe, expect, test } from "bun:test";
import { createApp } from "./app";
import { config } from "./config";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { sessions, users } from "./db/schema";
import { RateLimiter, rateLimitKey, RequestProtectionError, Security, type SecurityOptions } from "./services/security";
import { createSession, deleteExpiredSessions, getAuthenticatedUserId } from "./services/session";

function setup(overrides: Partial<SecurityOptions> = {}) {
  const security = new Security({ ...config.security, trustedProxyIps: [], ...overrides });
  const app = createApp(security);
  return { app, security, request: (path: string, init?: RequestInit) => app.handle(new Request(`http://localhost${path}`, init)) };
}
function json(body: unknown): RequestInit {
  return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function streamBody(value: string) {
  return new ReadableStream<Uint8Array>({ start(controller) {
    controller.enqueue(new TextEncoder().encode(value.slice(0, 20)));
    controller.enqueue(new TextEncoder().encode(value.slice(20)));
    controller.close();
  } });
}

describe("API request protections", () => {
  test("throttles login before validation, with Retry-After and no-store", async () => {
    const { request } = setup({ authPerMinute: 2 });
    expect((await request("/auth/login", json({}))).status).toBe(400);
    expect((await request("/auth/login", json({}))).status).toBe(400);
    const response = await request("/auth/login", json({}));
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "Too many requests" });
  });

  test("limits registration separately from login", async () => {
    const { request } = setup({ registrationsPerHour: 1 });
    expect((await request("/auth/register", json({}))).status).toBe(400);
    expect((await request("/auth/register", json({}))).status).toBe(429);
    expect((await request("/auth/login", json({}))).status).toBe(400);
  });

  test("limits general requests and does not bypass via spoofed headers", async () => {
    const { request } = setup({ requestsPerMinute: 1 });
    expect((await request("/health", { headers: { "X-Forwarded-For": "1.2.3.4" } })).status).toBe(200);
    expect((await request("/health", { headers: { "X-Forwarded-For": "5.6.7.8" } })).status).toBe(429);
  });

  test("normalizes account login limits", async () => {
    const { request } = setup({ loginsPerAccountWindow: 1 });
    const body = { email: "AccountLimit@Example.com", password: "not-a-real-password" };
    expect((await request("/auth/login", json(body))).status).toBe(401);
    const response = await request("/auth/login", json({ ...body, email: body.email.toLowerCase() }));
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await request("/auth/login", json({ ...body, email: "other@example.com" }))).status).toBe(401);
  });

  test("rejects large declared bodies before reading them", async () => {
    const { request } = setup({ maxAuthBodyBytes: 64 });
    const response = await request("/auth/login", { ...json({}), headers: { "Content-Type": "application/json", "Content-Length": "65" } });
    expect(response.status).toBe(413);
  });

  test("counts actual streamed bytes without Content-Length and with misleading lengths", async () => {
    const headerSets: Record<string, string>[] = [{ "Content-Type": "application/json" }, { "Content-Type": "application/json", "Content-Length": "2" }];
    for (const headers of headerSets) {
      const { request } = setup({ maxAuthBodyBytes: 64 });
      const response = await request("/auth/login", { method: "POST", headers, body: streamBody(JSON.stringify({ padding: "x".repeat(80) })) });
      expect(response.status).toBe(413);
      expect(await response.json()).toEqual({ error: "Request body too large" });
    }
  });

  test("accepts an auth body exactly at the byte limit", async () => {
    const body = JSON.stringify({ email: "boundary@example.com", password: "a-valid-password" });
    const { request } = setup({ maxAuthBodyBytes: Buffer.byteLength(body) });
    const response = await request("/auth/login", { method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" }, body });
    expect(response.status).toBe(401);
  });

  test("enforces the general body cap for note writes", async () => {
    const { request } = setup({ maxBodyBytes: 64 });
    const response = await request(`/notes/${crypto.randomUUID()}`, { ...json({ padding: "x".repeat(80) }), method: "PUT" });
    expect(response.status).toBe(413);
  });

  test("rejects malformed JSON, unsupported content types and compression", async () => {
    const { request } = setup();
    expect((await request("/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" })).status).toBe(400);
    expect((await request("/auth/login", { method: "POST", headers: { "Content-Type": "text/plain" }, body: "hello" })).status).toBe(415);
    expect((await request("/auth/login", { ...json({}), headers: { "Content-Type": "application/json", "Content-Encoding": "gzip" } })).status).toBe(415);
    expect((await request("/auth/login", { ...json({}), headers: { "Content-Type": "application/json", "Content-Length": "invalid" } })).status).toBe(400);
  });

  test("rejects oversized individual and aggregate headers and URLs", async () => {
    const first = setup({ maxHeaderValueBytes: 64 });
    expect((await first.request("/health", { headers: { "X-Large": "x".repeat(65) } })).status).toBe(431);
    const second = setup({ maxHeaderBytes: 128 });
    expect((await second.request("/health", { headers: { "X-One": "x".repeat(60), "X-Two": "x".repeat(60) } })).status).toBe(431);
    expect((await setup().request(`/health?q=${"x".repeat(2048)}`)).status).toBe(414);
  });

  test("sets API security headers on success and authentication errors", async () => {
    const { request } = setup();
    for (const path of ["/health", "/notes"]) {
      const response = await request(path);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
      expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
    }
    expect((await request("/does-not-exist")).status).toBe(404);
  });

  test("returns 503 when password hashing is at capacity", async () => {
    const { request, security } = setup({ maxConcurrentHashes: 1 });
    let release!: () => void;
    const held = security.withPasswordHash(() => new Promise<void>((resolve) => { release = resolve; }));
    try {
      const response = await request("/auth/register", json({ email: "busy@example.com", password: "a-strong-password" }));
      expect(response.status).toBe(503);
      expect(response.headers.get("retry-after")).toBe("1");
    } finally { release(); await held; }
  });

  test("handles concurrent same-email registration without a 500", async () => {
    const { request } = setup();
    const body = { email: `race-${crypto.randomUUID()}@example.com`, password: "a-strong-password" };
    const responses = await Promise.all([request("/auth/register", json(body)), request("/auth/register", json(body))]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  test("real HTTP uses the socket IP, not attacker-supplied forwarding headers", async () => {
    const { app } = setup({ requestsPerMinute: 1 });
    app.listen({ hostname: "127.0.0.1", port: 0 });
    try {
      const url = new URL("/health", app.server!.url);
      const first = await fetch(url, { headers: { "X-Forwarded-For": "1.2.3.4" } });
      expect(first.status).toBe(200);
      await first.text();
      const second = await fetch(url, { headers: { "X-Forwarded-For": "5.6.7.8" } });
      expect(second.status).toBe(429);
      await second.text();
    } finally { await app.stop(true); }
  });

  test("real HTTP rejects a streamed oversized auth body", async () => {
    const { app } = setup({ maxAuthBodyBytes: 64 });
    app.listen({ hostname: "127.0.0.1", port: 0 });
    try {
      const response = await fetch(new URL("/auth/login", app.server!.url), {
        method: "POST", headers: { "Content-Type": "application/json" }, body: streamBody(JSON.stringify({ padding: "x".repeat(80) })),
      });
      expect(response.status).toBe(413);
      await response.text();
    } finally { await app.stop(true); }
  });
});

describe("limiter and proxy trust", () => {
  test("windows expire without rejected attempts extending the lockout", () => {
    let now = 0;
    const limiter = new RateLimiter(2, () => now);
    limiter.check("a", 1, 1000);
    expect(() => limiter.check("a", 1, 1000)).toThrow(RequestProtectionError);
    now = 1000;
    expect(() => limiter.check("a", 1, 1000)).not.toThrow();
  });

  test("bounds memory, fails closed, and reclaims expired keys", () => {
    let now = 0;
    const limiter = new RateLimiter(1, () => now);
    limiter.check("a", 10, 1000);
    expect(() => limiter.check("b", 10, 1000)).toThrow(RequestProtectionError);
    now = 1000;
    expect(() => limiter.check("b", 10, 1000)).not.toThrow();
  });

  test("only trusts an allowlisted socket peer and takes the last forwarded IP", () => {
    const security = new Security({ ...config.security, trustedProxyIps: ["172.18.0.2"] });
    const request = new Request("http://localhost/", { headers: { "X-Forwarded-For": "1.1.1.1, 203.0.113.5", "X-Real-IP": "9.9.9.9" } });
    expect(security.clientIp(request, "192.0.2.8")).toBe("192.0.2.8");
    expect(security.clientIp(request, "172.18.0.2")).toBe("203.0.113.5");
    expect(security.clientIp(request, "::ffff:172.18.0.2")).toBe("203.0.113.5");
    expect(security.clientIp(request)).toBe("unknown");
    expect(security.clientIp(new Request("http://localhost/", { headers: { "X-Forwarded-For": "invalid" } }), "172.18.0.2")).toBe("172.18.0.2");
    expect(() => new Security({ ...config.security, trustedProxyIps: ["*"] })).toThrow();
  });

  test("trusts an IPv4 proxy range, so a recreated Caddy container keeps working", () => {
    const security = new Security({ ...config.security, trustedProxyIps: ["172.16.0.0/12"] });
    const request = new Request("http://localhost/", { headers: { "X-Forwarded-For": "198.51.100.1, 203.0.113.5" } });
    expect(security.clientIp(request, "172.18.0.2")).toBe("203.0.113.5");
    expect(security.clientIp(request, "::ffff:172.31.255.254")).toBe("203.0.113.5");
    expect(security.clientIp(request, "172.32.0.1")).toBe("172.32.0.1");
    expect(security.clientIp(request, "192.0.2.8")).toBe("192.0.2.8");
    expect(security.clientIp(request, "::1")).toBe("::1");
    for (const bad of ["172.16.0.0/7", "172.16.0.0/33", "172.16.0.0/x", "::/64", "172.16.0.0/12/1", "999.1.1.1/16"]) {
      expect(() => new Security({ ...config.security, trustedProxyIps: [bad] })).toThrow();
    }
  });

  test("hash slots are released even when work throws", async () => {
    const security = new Security({ ...config.security, maxConcurrentHashes: 1 });
    await expect(security.withPasswordHash(async () => { throw new Error("hash failed"); })).rejects.toThrow("hash failed");
    expect(await security.withPasswordHash(async () => "ok")).toBe("ok");
  });
});

describe("sessions and sign-in hardening", () => {
  test("rate-limit errors carry CORS headers for the web app only", async () => {
    const { request } = setup({ authPerMinute: 1 });
    const init = (origin: string) => ({ ...json({ email: "a@example.com", password: "long-enough-password" }), headers: { "Content-Type": "application/json", Origin: origin } });
    await request("/auth/login", init(config.webOrigin));
    const limited = await request("/auth/login", init(config.webOrigin));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("access-control-allow-origin")).toBe(config.webOrigin);
    // Exactly one value on every kind of error: a repeated header breaks CORS in browsers.
    const invalid = await setup().request("/auth/login", { ...init(config.webOrigin), body: JSON.stringify({ email: "bad" }) });
    expect(invalid.status).toBe(400);
    expect(invalid.headers.get("access-control-allow-origin")).toBe(config.webOrigin);
    const missing = await setup().request("/nope", { headers: { Origin: config.webOrigin } });
    expect(missing.headers.get("access-control-allow-origin")).toBe(config.webOrigin);
    const other = await request("/auth/login", init("https://evil.example"));
    expect(other.status).toBe(429);
    expect(other.headers.get("access-control-allow-origin")).toBeNull();
  });

  test("groups IPv6 clients by /64 and leaves IPv4 alone", () => {
    expect(rateLimitKey("203.0.113.5")).toBe("203.0.113.5");
    expect(rateLimitKey("2001:db8:1:2:aaaa::1")).toBe("2001:db8:1:2::/64");
    expect(rateLimitKey("2001:db8:1:2:ffff:ffff:ffff:ffff")).toBe("2001:db8:1:2::/64");
    expect(rateLimitKey("2001:0db8:0001:0002::")).toBe("2001:db8:1:2::/64");
    expect(rateLimitKey("::1")).toBe("0:0:0:0::/64");
    expect(rateLimitKey("2001:db8::1")).toBe("2001:db8:0:0::/64");
  });

  test("deletes expired sessions instead of keeping them", async () => {
    const id = crypto.randomUUID();
    await db.insert(users).values({ id, email: `${id}@example.com`, passwordHash: "test-only" });
    try {
      const { token } = await createSession(id);
      await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(sessions.userId, id));
      expect(await getAuthenticatedUserId(`Bearer ${token}`)).toBeNull();
      expect(await db.select().from(sessions).where(eq(sessions.userId, id))).toHaveLength(0);

      await createSession(id);
      await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(sessions.userId, id));
      await deleteExpiredSessions();
      expect(await db.select().from(sessions).where(eq(sessions.userId, id))).toHaveLength(0);
    } finally {
      await db.delete(users).where(eq(users.id, id));
    }
  });

  test("a login for an unknown email still verifies a password hash", async () => {
    let hashes = 0;
    const security = new Security({ ...config.security, trustedProxyIps: [] });
    const original = security.withPasswordHash.bind(security);
    security.withPasswordHash = (work) => { hashes++; return original(work); };
    const response = await createApp(security).handle(new Request("http://localhost/auth/login", json({ email: "nobody-here@example.com", password: "long-enough-password" })));
    expect(response.status).toBe(401);
    expect(hashes).toBe(1);
  });
});
