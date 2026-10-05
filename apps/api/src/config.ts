import { resolve } from "node:path";

export const config = {
  port: Number(process.env.API_PORT ?? 3000),
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  // Tests get a throwaway in-memory database; everything else defaults to a file next to the API.
  databasePath: process.env.DATABASE_PATH ?? (process.env.NODE_ENV === "test" ? ":memory:" : resolve(import.meta.dir, "../data/deeznote.db")),
  // Resolves to apps/api/drizzle both from src/ (dev) and from dist/ (built bundle).
  migrationsDir: process.env.MIGRATIONS_DIR ?? resolve(import.meta.dir, "../drizzle"),
  sessionDays: 30,
} as const;
