import { eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../db";
import { vaults } from "../db/schema";
import { getAuthenticatedUserId } from "../services/session";

const encryptedVault = t.Object({
  encryptedVaultKey: t.String({ minLength: 1 }),
  nonce: t.String({ minLength: 1 }),
  salt: t.String({ minLength: 1 }),
  kdf: t.Literal("argon2id-v1"),
});

export const vaultRoutes = new Elysia({ name: "routes.vault", prefix: "/vault" })
  .get("/", async ({ headers, set }) => {
    const userId = await getAuthenticatedUserId(headers.authorization);
    if (!userId) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const [vault] = await db.select().from(vaults).where(eq(vaults.userId, userId)).limit(1);
    if (!vault) return { vault: null };
    return {
      vault: {
        encryptedVaultKey: vault.encryptedVaultKey,
        nonce: vault.nonce,
        salt: vault.salt,
        kdf: vault.kdf,
      },
    };
  })
  .post("/", async ({ body, headers, set }) => {
    const userId = await getAuthenticatedUserId(headers.authorization);
    if (!userId) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const [existing] = await db.select({ userId: vaults.userId }).from(vaults).where(eq(vaults.userId, userId)).limit(1);
    if (existing) {
      set.status = 409;
      return { error: "Vault already exists" };
    }
    await db.insert(vaults).values({ userId, ...body });
    return { ok: true };
  }, { body: encryptedVault });
