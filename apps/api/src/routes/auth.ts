import { eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../db";
import { users } from "../db/schema";
import { createSession, revokeSession } from "../services/session";

const credentials = t.Object({
  email: t.String({ format: "email", maxLength: 320 }),
  password: t.String({ minLength: 10, maxLength: 200 }),
});

export const authRoutes = new Elysia({ name: "routes.auth", prefix: "/auth" })
  .post("/register", async ({ body, set }) => {
    const email = body.email.trim().toLowerCase();
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing) {
      set.status = 409;
      return { error: "An account with that email already exists" };
    }

    const id = crypto.randomUUID();
    const passwordHash = await Bun.password.hash(body.password, { algorithm: "argon2id" });
    await db.insert(users).values({ id, email, passwordHash });
    return { user: { id, email }, ...(await createSession(id)) };
  }, { body: credentials })
  .post("/login", async ({ body, set }) => {
    const email = body.email.trim().toLowerCase();
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user || !(await Bun.password.verify(body.password, user.passwordHash))) {
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
