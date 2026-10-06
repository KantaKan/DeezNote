import { eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../db";
import { users } from "../db/schema";
import { createSession, getAuthenticatedUserId, revokeSession } from "../services/session";
import type { Security } from "../services/security";

const credentials = t.Object({
  email: t.String({ format: "email", maxLength: 320 }),
  password: t.String({ minLength: 10, maxLength: 200 }),
});

// OWASP's minimum Argon2id profile (19 MiB, 2 passes): about a third of Bun's 64 MiB default,
// so concurrent logins don't spike memory on a small server. Existing hashes keep verifying,
// because each hash stores its own parameters. Note encryption is client-side and unaffected.
const PASSWORD_HASH_OPTIONS = { algorithm: "argon2id", memoryCost: 19_456, timeCost: 2 } as const;

// Verified against when the email has no account, so a failed login takes the same time either way
// and response timing doesn't reveal which emails are registered.
const decoyHash = Bun.password.hash(crypto.randomUUID(), PASSWORD_HASH_OPTIONS);

export function createAuthRoutes(security: Security) {
  return new Elysia({ name: "routes.auth", prefix: "/auth" })
  .post("/register", async ({ body, set }) => {
    const email = body.email.trim().toLowerCase();
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing) {
      set.status = 409;
      return { error: "An account with that email already exists" };
    }

    const id = crypto.randomUUID();
    const passwordHash = await security.withPasswordHash(() => Bun.password.hash(body.password, PASSWORD_HASH_OPTIONS));
    const [created] = await db.insert(users).values({ id, email, passwordHash })
      .onConflictDoNothing({ target: users.email }).returning({ id: users.id });
    if (!created) {
      set.status = 409;
      return { error: "An account with that email already exists" };
    }
    return { user: { id, email }, ...(await createSession(id)) };
  }, { body: credentials })
  .post("/login", async ({ body, set }) => {
    const email = body.email.trim().toLowerCase();
    security.checkLogin(email);
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const passwordHash = user?.passwordHash ?? await decoyHash;
    const valid = await security.withPasswordHash(() => Bun.password.verify(body.password, passwordHash));
    if (!user || !valid) {
      set.status = 401;
      return { error: "Invalid email or password" };
    }
    return { user: { id: user.id, email }, ...(await createSession(user.id)) };
  }, { body: credentials })
  // PDPA right to erasure, self-service: needs the session and the account password. Deleting the user
  // cascades to its vault, notes and sessions (foreign keys are enforced in db/index.ts).
  .post("/delete-account", async ({ body, headers, set }) => {
    const userId = await getAuthenticatedUserId(headers.authorization);
    if (!userId) {
      set.status = 401;
      return { error: "Unauthorized" };
    }
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }
    security.checkLogin(user.email);
    if (!(await security.withPasswordHash(() => Bun.password.verify(body.password, user.passwordHash)))) {
      set.status = 403;
      return { error: "Wrong password" };
    }
    await db.delete(users).where(eq(users.id, userId));
    return { ok: true };
  }, { body: t.Object({ password: t.String({ minLength: 1, maxLength: 200 }) }) })
  .post("/logout", async ({ headers, set }) => {
    if (!(await revokeSession(headers.authorization))) {
      set.status = 401;
      return { error: "Unauthorized" };
    }
    return { ok: true };
  });
}
