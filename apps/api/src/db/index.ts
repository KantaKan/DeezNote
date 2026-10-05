import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "../config";

if (config.databasePath !== ":memory:") mkdirSync(dirname(config.databasePath), { recursive: true });

const sqlite = new Database(config.databasePath, { create: true });
// WAL lets reads continue during writes; NORMAL sync is safe with WAL and much cheaper on small disks.
sqlite.exec("PRAGMA journal_mode = WAL;");
sqlite.exec("PRAGMA synchronous = NORMAL;");
sqlite.exec("PRAGMA foreign_keys = ON;");
sqlite.exec("PRAGMA busy_timeout = 5000;");

export const db = drizzle(sqlite);

// Apply pending migrations on startup so a deploy is just "copy files + restart".
migrate(db, { migrationsFolder: config.migrationsDir });
