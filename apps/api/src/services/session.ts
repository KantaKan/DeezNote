import { eq, lte } from "drizzle-orm";
import { config } from "../config";
import { db } from "../db";
import { sessions } from "../db/schema";

function createToken() {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Buffer.from(digest).toString("hex");
}

/** Removes every expired session. Runs on each sign-in, so expired rows don't outlive the next login by anyone. */
export async function deleteExpiredSessions(now = new Date()) {
  await db.delete(sessions).where(lte(sessions.expiresAt, now));
}

export async function createSession(userId: string) {
  await deleteExpiredSessions();
  const token = createToken();
  const expiresAt = new Date(Date.now() + config.sessionDays * 86_400_000);
  await db.insert(sessions).values({ tokenHash: await hashToken(token), userId, expiresAt });
  return { token, expiresAt: expiresAt.toISOString() };
}

export async function getAuthenticatedUserId(authorization?: string) {
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  if (!token) return null;

  const [session] = await db
    .select({ userId: sessions.userId, expiresAt: sessions.expiresAt })
    .from(sessions)
    .where(eq(sessions.tokenHash, await hashToken(token)))
    .limit(1);

  if (!session) return null;
  if (session.expiresAt <= new Date()) {
    await db.delete(sessions).where(eq(sessions.tokenHash, await hashToken(token)));
    return null;
  }
  return session.userId;
}

export async function revokeSession(authorization?: string) {
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  if (!token) return false;
  await db.delete(sessions).where(eq(sessions.tokenHash, await hashToken(token)));
  return true;
}
