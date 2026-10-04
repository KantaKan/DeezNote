import { and, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../db";
import { notes } from "../db/schema";
import { getAuthenticatedUserId } from "../services/session";

const encryptedNote = t.Object({
  id: t.String({ format: "uuid" }),
  encryptedContent: t.String({ minLength: 1 }),
  encryptedNoteKey: t.String({ minLength: 1 }),
  contentNonce: t.String({ minLength: 1 }),
  keyNonce: t.String({ minLength: 1 }),
  baseVersion: t.Integer({ minimum: 0 }),
});

export const noteRoutes = new Elysia({ name: "routes.notes", prefix: "/notes" })
  .get("/", async ({ headers, set }) => {
    const userId = await getAuthenticatedUserId(headers.authorization);
    if (!userId) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const rows = await db.select().from(notes).where(eq(notes.userId, userId));
    return {
      notes: rows.map((note) => ({
        id: note.id,
        encryptedContent: note.encryptedContent,
        encryptedNoteKey: note.encryptedNoteKey,
        contentNonce: note.contentNonce,
        keyNonce: note.keyNonce,
        version: note.version,
        updatedAt: note.updatedAt.toISOString(),
      })),
    };
  })
  .delete("/:id", async ({ headers, params, set }) => {
    const userId = await getAuthenticatedUserId(headers.authorization);
    if (!userId) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const [deleted] = await db.delete(notes)
      .where(and(eq(notes.id, params.id), eq(notes.userId, userId)))
      .returning({ id: notes.id });
    if (!deleted) {
      set.status = 404;
      return { error: "Note not found" };
    }
    return { ok: true };
  }, { params: t.Object({ id: t.String({ format: "uuid" }) }) })
  .put("/:id", async ({ body, headers, params, set }) => {
    const userId = await getAuthenticatedUserId(headers.authorization);
    if (!userId) {
      set.status = 401;
      return { error: "Unauthorized" };
    }
    if (params.id !== body.id) {
      set.status = 400;
      return { error: "Note ID mismatch" };
    }

    const [existing] = await db.select().from(notes)
      .where(and(eq(notes.id, body.id), eq(notes.userId, userId)))
      .limit(1);

    if (!existing) {
      if (body.baseVersion !== 0) {
        set.status = 409;
        return { error: "Sync conflict: note does not exist on server" };
      }
      const [created] = await db.insert(notes).values({
        id: body.id,
        userId,
        encryptedContent: body.encryptedContent,
        encryptedNoteKey: body.encryptedNoteKey,
        contentNonce: body.contentNonce,
        keyNonce: body.keyNonce,
        version: 1,
      }).returning();
      return { version: created.version, updatedAt: created.updatedAt.toISOString() };
    }

    if (existing.version !== body.baseVersion) {
      set.status = 409;
      return { error: "Sync conflict", serverVersion: existing.version };
    }

    const [updated] = await db.update(notes).set({
      encryptedContent: body.encryptedContent,
      encryptedNoteKey: body.encryptedNoteKey,
      contentNonce: body.contentNonce,
      keyNonce: body.keyNonce,
      version: existing.version + 1,
      updatedAt: new Date(),
    }).where(and(
      eq(notes.id, body.id),
      eq(notes.userId, userId),
      eq(notes.version, body.baseVersion),
    )).returning();

    if (!updated) {
      set.status = 409;
      return { error: "Sync conflict" };
    }
    return { version: updated.version, updatedAt: updated.updatedAt.toISOString() };
  }, { body: encryptedNote });
