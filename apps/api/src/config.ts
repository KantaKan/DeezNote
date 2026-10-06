import { resolve } from "node:path";

function positiveInteger(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}

export const config = {
  port: Number(process.env.API_PORT ?? 3000),
  // In production, bind to Docker's bridge IP so only the Caddy container can reach the API.
  hostname: process.env.API_HOST ?? "0.0.0.0",
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  // Tests get a throwaway in-memory database; everything else defaults to a file next to the API.
  databasePath: process.env.DATABASE_PATH ?? (process.env.NODE_ENV === "test" ? ":memory:" : resolve(import.meta.dir, "../data/deeznote.db")),
  // Resolves to apps/api/drizzle both from src/ (dev) and from dist/ (built bundle).
  migrationsDir: process.env.MIGRATIONS_DIR ?? resolve(import.meta.dir, "../drizzle"),
  sessionDays: 30,
  // Storage limits per plan, measured on the encrypted size the server actually stores (it can't see inside notes).
  plans: {
    free: {
      noteBytes: positiveInteger("FREE_NOTE_BYTES", 256 * 1024),
      totalBytes: positiveInteger("FREE_TOTAL_BYTES", 25 * 1024 * 1024),
    },
    pro: {
      noteBytes: positiveInteger("PRO_NOTE_BYTES", 8 * 1024 * 1024),
      totalBytes: positiveInteger("PRO_TOTAL_BYTES", 1024 * 1024 * 1024),
    },
  },
  security: {
    maxBodyBytes: positiveInteger("API_MAX_BODY_BYTES", 8 * 1024 * 1024),
    maxAuthBodyBytes: positiveInteger("API_MAX_AUTH_BODY_BYTES", 4096),
    maxHeaderBytes: positiveInteger("API_MAX_HEADER_BYTES", 16 * 1024),
    maxHeaderValueBytes: positiveInteger("API_MAX_HEADER_VALUE_BYTES", 8192),
    maxUrlBytes: 2048,
    requestsPerMinute: positiveInteger("API_REQUESTS_PER_MINUTE", 120),
    authPerMinute: positiveInteger("API_AUTH_PER_MINUTE", 10),
    registrationsPerHour: positiveInteger("API_REGISTRATIONS_PER_HOUR", 5),
    loginsPerAccountWindow: positiveInteger("API_LOGINS_PER_ACCOUNT_WINDOW", 20),
    maxConcurrentHashes: positiveInteger("API_MAX_CONCURRENT_HASHES", 2),
    maxRateLimitKeys: positiveInteger("API_MAX_RATE_LIMIT_KEYS", 10_000),
    noteWritesPerMinute: positiveInteger("API_NOTE_WRITES_PER_MINUTE", 90),
    noteUploadBytesPerMinute: positiveInteger("API_NOTE_UPLOAD_BYTES_PER_MINUTE", 20 * 1024 * 1024),
    maxNotesPerAccount: positiveInteger("API_MAX_NOTES_PER_ACCOUNT", 1000),
    // Exact socket-peer allowlist, never a blanket trust of forwarded headers.
    trustedProxyIps: (process.env.API_TRUSTED_PROXY_IPS ?? "").split(",").map((ip) => ip.trim()).filter(Boolean),
  },
} as const;
