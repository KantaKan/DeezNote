import { eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { config } from "../config";
import { db } from "../db";
import { users } from "../db/schema";
import { getAuthenticatedUserId } from "../services/session";
import { storedBytes } from "../services/storage";

export const accountRoutes = new Elysia({ name: "routes.account", prefix: "/account" })
  .get("/", async ({ headers, set }) => {
    const userId = await getAuthenticatedUserId(headers.authorization);
    const [user] = userId ? await db.select({ email: users.email, plan: users.plan }).from(users).where(eq(users.id, userId)).limit(1) : [];
    if (!userId || !user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }
    const limits = config.plans[user.plan];
    return {
      email: user.email,
      plan: user.plan,
      usage: { usedBytes: await storedBytes(userId), totalBytes: limits.totalBytes, noteBytes: limits.noteBytes },
    };
  });
