import { and, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../db";
import { notes } from "../db/schema";
import { getAuthenticatedUserId } from "../services/session";
import { storageProblemInTransaction } from "../services/storage";
import type { Security } from "../services/security";

const encryptedNote = t.Object({
  id: t.String({ format: "uuid" }),
  encryptedContent: t.String({ minLength: 1 }),
  // Envelopes have fixed cryptographic sizes; never allow arbitrary data in metadata fields.
  encryptedNoteKey: t.String({ minLength: 1, maxLength: 128 }),
  contentNonce: t.String({ minLength: 1, maxLength: 64 }),
  keyNonce: t.String({ minLength: 1, maxLength: 64 }),
  baseVersion: t.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER - 1 }),
});

export function createNoteRoutes(security: Security) {
  return new Elysia({ name: "routes.notes", prefix: "/notes" })
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
    .delete("/:id", async ({ headers, params, request, set }) => {
      const userId = await getAuthenticatedUserId(headers.authorization);
      if (!userId) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      security.checkNoteWrite(userId, request);
      const [deleted] = await db.delete(notes)
        .where(and(eq(notes.id, params.id), eq(notes.userId, userId)))
        .returning({ id: notes.id });
      if (!deleted) {
        set.status = 404;
        return { error: "Note not found" };
      }
      return { ok: true };
    }, { params: t.Object({ id: t.String({ format: "uuid" }) }) })
    .put("/:id", async ({ body, headers, params, request, set }) => {
      const userId = await getAuthenticatedUserId(headers.authorization);
      if (!userId) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      security.checkNoteWrite(userId, request);
      if (params.id !== body.id) {
        set.status = 400;
        return { error: "Note ID mismatch" };
      }

      // Bun SQLite transactions must be synchronous. Keep quota reads and writes in the same
      // IMMEDIATE transaction so simultaneous saves cannot both spend the remaining storage.
      return db.transaction((tx) => {
        const existing = tx.select().from(notes)
          .where(and(eq(notes.id, body.id), eq(notes.userId, userId))).get();
        if (!existing && body.baseVersion !== 0) {
          set.status = 409;
          return { error: "Sync conflict: note does not exist on server" };
        }
        if (existing && existing.version !== body.baseVersion) {
          set.status = 409;
          return { error: "Sync conflict", serverVersion: existing.version };
        }
        const problem = storageProblemInTransaction(
          tx, userId, body.id, Buffer.byteLength(body.encryptedContent, "utf8"), security.options.maxNotesPerAccount,
        );
        if (problem) {
          const { status, ...details } = problem;
          set.status = status;
          return details;
        }
        const values = {
          encryptedContent: body.encryptedContent,
          encryptedNoteKey: body.encryptedNoteKey,
          contentNonce: body.contentNonce,
          keyNonce: body.keyNonce,
        };
        if (!existing) {
          const created = tx.insert(notes).values({ id: body.id, userId, ...values, version: 1 })
            .onConflictDoNothing({ target: notes.id }).returning().get();
          if (!created) {
            set.status = 409;
            return { error: "Note ID unavailable" };
          }
          return { version: created.version, updatedAt: created.updatedAt.toISOString() };
        }
        const updated = tx.update(notes).set({ ...values, version: existing.version + 1, updatedAt: new Date() })
          .where(and(eq(notes.id, body.id), eq(notes.userId, userId), eq(notes.version, body.baseVersion)))
          .returning().get();
        if (!updated) {
          set.status = 409;
          return { error: "Sync conflict" };
        }
        return { version: updated.version, updatedAt: updated.updatedAt.toISOString() };
      }, { behavior: "immediate" });
    }, { body: encryptedNote, params: t.Object({ id: t.String({ format: "uuid" }) }) });
}
