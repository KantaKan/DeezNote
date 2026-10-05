import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Timestamps are stored as epoch milliseconds and read back as Date objects.
const timestamp = (name: string) => integer(name, { mode: "timestamp_ms" });
const now = () => new Date();

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").notNull().$defaultFn(now),
});

export const sessions = sqliteTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().$defaultFn(now),
});

export const vaults = sqliteTable("vaults", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  encryptedVaultKey: text("encrypted_vault_key").notNull(),
  nonce: text("nonce").notNull(),
  salt: text("salt").notNull(),
  kdf: text("kdf").notNull(),
  createdAt: timestamp("created_at").notNull().$defaultFn(now),
});

export const notes = sqliteTable("notes", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  encryptedContent: text("encrypted_content").notNull(),
  encryptedNoteKey: text("encrypted_note_key").notNull(),
  contentNonce: text("content_nonce").notNull(),
  keyNonce: text("key_nonce").notNull(),
  version: integer("version").notNull().default(1),
  updatedAt: timestamp("updated_at").notNull().$defaultFn(now),
}, (table) => [index("notes_user_id_idx").on(table.userId)]);
