import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const vaults = pgTable("vaults", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  encryptedVaultKey: text("encrypted_vault_key").notNull(),
  nonce: text("nonce").notNull(),
  salt: text("salt").notNull(),
  kdf: text("kdf").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notes = pgTable("notes", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  encryptedContent: text("encrypted_content").notNull(),
  encryptedNoteKey: text("encrypted_note_key").notNull(),
  contentNonce: text("content_nonce").notNull(),
  keyNonce: text("key_nonce").notNull(),
  version: integer("version").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
