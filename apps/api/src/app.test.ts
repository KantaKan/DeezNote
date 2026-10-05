import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { app } from "./app";
import { db } from "./db";
import { notes, users } from "./db/schema";

function request(path: string, init?: RequestInit) {
  return app.handle(new Request(`http://localhost${path}`, init));
}

describe("DeezNote API", () => {
  test("reports its health", async () => {
    const response = await request("/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  test("adds CORS headers for the configured web origin", async () => {
    const response = await request("/health", {
      headers: { Origin: "http://localhost:5173" },
    });

    expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
  });

  test("rejects vault access without a session", async () => {
    const response = await request("/vault");

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  test("rejects note access without a session", async () => {
    const response = await request("/notes");

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  test("validates registration before querying the database", async () => {
    const response = await request("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "not-an-email", password: "short" }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid request" });
  });

  test("runs the full account, vault and note lifecycle against SQLite", async () => {
    const json = (body: unknown, token?: string): RequestInit => ({
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token && { Authorization: `Bearer ${token}` }) },
      body: JSON.stringify(body),
    });
    const credentials = { email: "Lifecycle@Example.com", password: "a strong password" };

    const registered = await request("/auth/register", json(credentials));
    expect(registered.status).toBe(200);
    const { token } = await registered.json() as { token: string };
    expect((await request("/auth/register", json(credentials))).status).toBe(409);
    expect((await request("/auth/login", json({ ...credentials, password: "the wrong password" }))).status).toBe(401);
    expect((await request("/auth/login", json({ ...credentials, email: "lifecycle@example.com" }))).status).toBe(200);

    const auth = { Authorization: `Bearer ${token}` };
    const vault = { encryptedVaultKey: "k", nonce: "n", salt: "s", kdf: "argon2id-v1" };
    expect((await request("/vault", json(vault, token))).status).toBe(200);
    expect((await request("/vault", json(vault, token))).status).toBe(409);
    expect(await (await request("/vault", { headers: auth })).json()).toEqual({ vault });

    const id = crypto.randomUUID();
    const note = { id, encryptedContent: "c", encryptedNoteKey: "nk", contentNonce: "cn", keyNonce: "kn", baseVersion: 0 };
    const put = (body: typeof note) => request(`/notes/${id}`, { ...json(body, token), method: "PUT" });
    const created = await put(note);
    expect(created.status).toBe(200);
    expect((await created.json() as { version: number }).version).toBe(1);
    expect((await put({ ...note, encryptedContent: "c2", baseVersion: 1 })).status).toBe(200);
    expect((await put({ ...note, encryptedContent: "stale", baseVersion: 1 })).status).toBe(409);

    const listed = await (await request("/notes", { headers: auth })).json() as { notes: Array<{ encryptedContent: string; version: number; updatedAt: string }> };
    expect(listed.notes).toHaveLength(1);
    expect(listed.notes[0]).toMatchObject({ encryptedContent: "c2", version: 2 });
    expect(Number.isNaN(Date.parse(listed.notes[0].updatedAt))).toBe(false);

    expect((await request(`/notes/${id}`, { method: "DELETE", headers: auth })).status).toBe(200);
    expect((await request(`/notes/${id}`, { method: "DELETE", headers: auth })).status).toBe(404);

    await put({ ...note, baseVersion: 0 });
    const [user] = await db.select().from(users).where(eq(users.email, "lifecycle@example.com"));
    await db.delete(users).where(eq(users.id, user.id));
    expect(await db.select().from(notes).where(eq(notes.userId, user.id))).toHaveLength(0);

    // Deleting the account cascades to its sessions, so the old token no longer works.
    expect((await request("/vault", { headers: auth })).status).toBe(401);
  });
});
