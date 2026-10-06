import { afterEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createApp } from "./app";
import { config } from "./config";
import { db } from "./db";
import { notes, users } from "./db/schema";
import { Security, type SecurityOptions } from "./services/security";
import { createSession } from "./services/session";

const userIds: string[] = [];
afterEach(async () => {
  for (const id of userIds.splice(0)) await db.delete(users).where(eq(users.id, id));
});
async function account() {
  const id = crypto.randomUUID();
  await db.insert(users).values({ id, email: `${id}@example.com`, passwordHash: "test-only" });
  userIds.push(id);
  return { id, token: (await createSession(id)).token };
}
function body(id = crypto.randomUUID(), encryptedContent = "ciphertext", baseVersion = 0) {
  return { id, encryptedContent, encryptedNoteKey: "key", contentNonce: "nonce", keyNonce: "nonce", baseVersion };
}
function setup(overrides: Partial<SecurityOptions> = {}) {
  let now = 0;
  const app = createApp(new Security({ ...config.security, ...overrides }, () => now));
  return {
    advance: () => { now += 60_000; },
    request: (token: string, value: ReturnType<typeof body>, method = "PUT", extra: Record<string, unknown> = {}) => app.handle(new Request(`http://localhost/notes/${value.id}`, {
      method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Forwarded-For": crypto.randomUUID() },
      ...(method === "DELETE" ? {} : { body: JSON.stringify({ ...value, ...extra }) }),
    })),
  };
}

describe("authenticated note protections", () => {
  test("shares write budgets across sessions; counts deletes and conflicts; resets after a minute", async () => {
    const a = await account();
    const b = await account();
    const secondToken = (await createSession(a.id)).token;
    const { request, advance } = setup({ noteWritesPerMinute: 3 });
    const note = body();
    expect((await request(a.token, note)).status).toBe(200);
    expect((await request(secondToken, note)).status).toBe(409);
    expect((await request(secondToken, note, "DELETE")).status).toBe(200);
    const throttled = await request(a.token, body());
    expect(throttled.status).toBe(429);
    expect(throttled.headers.get("retry-after")).toBe("60");
    expect((await request(b.token, body())).status).toBe(200);
    advance();
    expect((await request(a.token, body())).status).toBe(200);
  });

  test("charges actual full JSON bytes, including extra fields, without Content-Length", async () => {
    const a = await account();
    const note = body(undefined, "😀");
    const bytes = Buffer.byteLength(JSON.stringify(note));
    const { request, advance } = setup({ noteUploadBytesPerMinute: bytes * 2 });
    expect((await request(a.token, note)).status).toBe(200);
    expect((await request(a.token, body(note.id, "😀", 1))).status).toBe(200);
    const blocked = await request(a.token, body(note.id, "😀", 2));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBe("60");
    advance();
    // The unknown field isn't stored, but its bytes must still consume the upload budget.
    expect((await request(a.token, body(note.id, "😀", 2), "PUT", { padding: "x".repeat(bytes * 2) })).status).toBe(429);
    expect((await request(a.token, body(note.id, "😀", 2))).status).toBe(200);
    expect((await request(a.token, note, "DELETE")).status).toBe(200);
  });

  test("atomically caps note count, allows replacements and frees capacity on deletion", async () => {
    const a = await account();
    const { request } = setup({ maxNotesPerAccount: 1 });
    const first = body();
    const second = body();
    const results = await Promise.all([request(a.token, first), request(a.token, second)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 413]);
    expect(await results.find((r) => r.status === 413)!.json()).toMatchObject({ code: "NOTE_LIMIT_REACHED", limitNotes: 1 });
    const saved = results[0]!.status === 200 ? first : second;
    const rejected = saved === first ? second : first;
    expect((await request(a.token, body(saved.id, "updated", 1))).status).toBe(200);
    expect((await request(a.token, saved, "DELETE")).status).toBe(200);
    expect((await request(a.token, rejected)).status).toBe(200);
  });

  test("storage is UTF-8 bytes, and concurrent creates cannot overrun the plan", async () => {
    const a = await account();
    await db.insert(notes).values({ ...body(undefined, "x".repeat(config.plans.free.totalBytes - 4)), userId: a.id });
    const { request } = setup();
    const results = await Promise.all([request(a.token, body(undefined, "😀")), request(a.token, body(undefined, "😀"))]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 413]);
    expect(await results.find((r) => r.status === 413)!.json()).toMatchObject({ code: "STORAGE_FULL" });
    const tooLarge = await request(a.token, body(undefined, "😀".repeat(config.plans.free.noteBytes / 4 + 1)));
    expect(tooLarge.status).toBe(413);
    expect(await tooLarge.json()).toMatchObject({ code: "NOTE_TOO_LARGE" });
  });

  test("bounds envelope fields and prevents overwriting another account's note", async () => {
    const a = await account();
    const b = await account();
    const { request } = setup();
    const note = body();
    expect((await request(a.token, note, "PUT", { encryptedNoteKey: "x".repeat(129) })).status).toBe(400);
    expect((await request(a.token, note, "PUT", { contentNonce: "x".repeat(65) })).status).toBe(400);
    expect((await request(a.token, note, "PUT", { keyNonce: "x".repeat(65) })).status).toBe(400);
    expect((await request(a.token, note)).status).toBe(200);
    expect((await request(b.token, note)).status).toBe(409);
    expect((await request(b.token, note, "DELETE")).status).toBe(404);
    expect((await request(a.token, body(note.id, "updated", 1))).status).toBe(200);
  });
});
