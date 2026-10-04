import { eq } from "drizzle-orm";
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

export async function createSession(userId: string) {
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

  if (!session || session.expiresAt <= new Date()) return null;
  return session.userId;
}

export async function revokeSession(authorization?: string) {
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  if (!token) return false;
  await db.delete(sessions).where(eq(sessions.tokenHash, await hashToken(token)));
  return true;
}
