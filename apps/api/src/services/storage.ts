import { and, eq, ne, sql } from "drizzle-orm";
import { config } from "../config";
import { db } from "../db";
import { notes, users } from "../db/schema";

export type Plan = keyof typeof config.plans;

/** Bytes of ciphertext a user stores, optionally leaving one note out (the one being replaced). */
export async function storedBytes(userId: string, exceptNoteId?: string) {
  const [row] = await db
    .select({ bytes: sql<number>`coalesce(sum(length(cast(${notes.encryptedContent} as blob))), 0)` })
    .from(notes)
    .where(exceptNoteId ? and(eq(notes.userId, userId), ne(notes.id, exceptNoteId)) : eq(notes.userId, userId));
  return Number(row?.bytes ?? 0);
}

export async function planOf(userId: string): Promise<Plan> {
  const [user] = await db.select({ plan: users.plan }).from(users).where(eq(users.id, userId)).limit(1);
  return user?.plan ?? "free";
}

/** Why a save would break the user's plan limits, or null when it fits. */
export function storageProblemInTransaction(
  database: Pick<typeof db, "select">,
  userId: string,
  noteId: string,
  noteBytes: number,
  maxNotes: number,
) {
  const user = database.select({ plan: users.plan }).from(users).where(eq(users.id, userId)).get();
  const plan = user?.plan ?? "free";
  const limits = config.plans[plan];
  if (noteBytes > limits.noteBytes) {
    return { status: 413, code: "NOTE_TOO_LARGE", error: "This note is too large for your plan", plan, limitBytes: limits.noteBytes };
  }
  const usage = database.select({
    bytes: sql<number>`coalesce(sum(length(cast(${notes.encryptedContent} as blob))), 0)`,
    count: sql<number>`count(*)`,
  }).from(notes).where(and(eq(notes.userId, userId), ne(notes.id, noteId))).get();
  // Excluding the replaced note lets updates work when already at the note-count limit.
  if (Number(usage?.count ?? 0) >= maxNotes) {
    return { status: 413, code: "NOTE_LIMIT_REACHED", error: "Your note count limit has been reached", plan, limitNotes: maxNotes };
  }
  if (Number(usage?.bytes ?? 0) + noteBytes > limits.totalBytes) {
    return { status: 413, code: "STORAGE_FULL", error: "Your storage is full", plan, limitBytes: limits.totalBytes };
  }
  return null;
}

/** Non-transactional preflight only; note routes check again inside the write transaction. */
export async function storageProblem(userId: string, noteId: string, noteBytes: number) {
  return storageProblemInTransaction(db, userId, noteId, noteBytes, config.security.maxNotesPerAccount);
}
