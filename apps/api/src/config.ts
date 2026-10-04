export const config = {
  port: Number(process.env.API_PORT ?? 3000),
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  databaseUrl: process.env.DATABASE_URL ?? "postgres://savetext:savetext@localhost:5432/savetext",
  sessionDays: 30,
} as const;
