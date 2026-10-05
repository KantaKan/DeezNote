import { and, eq, ne, sql } from "drizzle-orm";
import { config } from "../config";
import { db } from "../db";
import { notes, users } from "../db/schema";

export type Plan = keyof typeof config.plans;

/** Bytes of ciphertext a user stores, optionally leaving one note out (the one being replaced). */
export async function storedBytes(userId: string, exceptNoteId?: string) {
  const [row] = await db
    .select({ bytes: sql<number>`coalesce(sum(length(${notes.encryptedContent})), 0)` })
    .from(notes)
    .where(exceptNoteId ? and(eq(notes.userId, userId), ne(notes.id, exceptNoteId)) : eq(notes.userId, userId));
  return Number(row?.bytes ?? 0);
}

export async function planOf(userId: string): Promise<Plan> {
  const [user] = await db.select({ plan: users.plan }).from(users).where(eq(users.id, userId)).limit(1);
  return user?.plan ?? "free";
}

/** Why a save would break the user's plan limits, or null when it fits. */
export async function storageProblem(userId: string, noteId: string, noteBytes: number) {
  const plan = await planOf(userId);
  const limits = config.plans[plan];
  if (noteBytes > limits.noteBytes) {
    return { status: 413, code: "NOTE_TOO_LARGE", error: "This note is too large for your plan", plan, limitBytes: limits.noteBytes };
  }
  if (await storedBytes(userId, noteId) + noteBytes > limits.totalBytes) {
    return { status: 413, code: "STORAGE_FULL", error: "Your storage is full", plan, limitBytes: limits.totalBytes };
  }
  return null;
}
