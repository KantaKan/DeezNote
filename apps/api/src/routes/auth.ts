import { eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../db";
import { users } from "../db/schema";
import { createSession, revokeSession } from "../services/session";
import type { Security } from "../services/security";

const credentials = t.Object({
  email: t.String({ format: "email", maxLength: 320 }),
  password: t.String({ minLength: 10, maxLength: 200 }),
});

// OWASP's minimum Argon2id profile (19 MiB, 2 passes): about a third of Bun's 64 MiB default,
// so concurrent logins don't spike memory on a small server. Existing hashes keep verifying,
// because each hash stores its own parameters. Note encryption is client-side and unaffected.
const PASSWORD_HASH_OPTIONS = { algorithm: "argon2id", memoryCost: 19_456, timeCost: 2 } as const;

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
    if (!user || !(await security.withPasswordHash(() => Bun.password.verify(body.password, user.passwordHash)))) {
      set.status = 401;
      return { error: "Invalid email or password" };
    }
    return { user: { id: user.id, email }, ...(await createSession(user.id)) };
  }, { body: credentials })
  .post("/logout", async ({ headers, set }) => {
    if (!(await revokeSession(headers.authorization))) {
      set.status = 401;
      return { error: "Unauthorized" };
    }
    return { ok: true };
  });
}
