import { describe, expect, test } from "bun:test";
import type { EncryptedNote, NotePayload } from "@save-text/shared";
import { ApiError } from "./api";
import type { LocalNote } from "./db";
import { pullNotes, pushPending, syncNotes, type NoteStore, type SyncApi } from "./sync";

function note(id: string, extra: Partial<LocalNote> = {}): LocalNote {
  return { id, encryptedContent: `c-${id}`, encryptedNoteKey: "k", contentNonce: "n", keyNonce: "n", version: 1, updatedAt: "2026-10-01T00:00:00.000Z", syncStatus: "synced", ...extra };
}

function memoryStore(initial: LocalNote[]): NoteStore & { notes: Map<string, LocalNote> } {
  const notes = new Map(initial.map((n) => [n.id, n]));
  return {
    notes,
    all: async () => [...notes.values()],
    put: async (n) => { notes.set(n.id, n); },
    bulkPut: async (list) => { for (const n of list) notes.set(n.id, n); },
    bulkDelete: async (ids) => { for (const id of ids) notes.delete(id); },
  };
}

function fakeApi(server: EncryptedNote[], fail: (payload: NotePayload) => Error | null = () => null): SyncApi & { sent: NotePayload[] } {
  const sent: NotePayload[] = [];
  return {
    sent,
    getNotes: async () => ({ notes: server }),
    saveNote: async (payload) => {
      sent.push(payload);
      const error = fail(payload);
      if (error) throw error;
      return { version: payload.baseVersion + 1, updatedAt: "2026-10-06T00:00:00.000Z" };
    },
  };
}

describe("note sync", () => {
  test("uploads notes saved offline, oldest first, with their base version", async () => {
    const store = memoryStore([
      note("b", { syncStatus: "pending", version: 3, updatedAt: "2026-10-03T00:00:00.000Z" }),
      note("a", { syncStatus: "pending", version: 0, updatedAt: "2026-10-02T00:00:00.000Z" }),
      note("c"),
    ]);
    const api = fakeApi([]);
    expect(await pushPending(api, store)).toEqual({ pushed: 2, stopped: null });
    expect(api.sent.map((p) => [p.id, p.baseVersion])).toEqual([["a", 0], ["b", 3]]);
    expect(Object.keys(api.sent[0]).sort()).toEqual(["baseVersion", "contentNonce", "encryptedContent", "encryptedNoteKey", "id", "keyNonce"]);
    expect(store.notes.get("a")).toMatchObject({ syncStatus: "synced", version: 1 });
    expect(store.notes.get("b")).toMatchObject({ syncStatus: "synced", version: 4 });
  });

  test("marks conflicts and keeps going; stops on rate limits, full storage or no connection", async () => {
    const conflict = memoryStore([note("a", { syncStatus: "pending" }), note("b", { syncStatus: "pending", updatedAt: "2026-10-02T00:00:00.000Z" })]);
    expect(await pushPending(fakeApi([], (p) => p.id === "a" ? new ApiError("Sync conflict", 409) : null), conflict)).toEqual({ pushed: 1, stopped: null });
    expect(conflict.notes.get("a")!.syncStatus).toBe("conflict");

    for (const [error, stopped] of [[new ApiError("Too many", 429), "rate-limited"], [new ApiError("Full", 413), "over-limit"], [new TypeError("Failed to fetch"), "offline"]] as const) {
      const store = memoryStore([note("a", { syncStatus: "pending" }), note("b", { syncStatus: "pending", updatedAt: "2026-10-02T00:00:00.000Z" })]);
      const api = fakeApi([], () => error);
      expect(await pushPending(api, store)).toEqual({ pushed: 0, stopped });
      expect(api.sent).toHaveLength(1);
      expect([...store.notes.values()].every((n) => n.syncStatus === "pending")).toBe(true);
    }
  });

  test("pull keeps local unsynced edits and removes notes deleted on another device", async () => {
    const store = memoryStore([note("kept", { syncStatus: "pending", encryptedContent: "local" }), note("gone"), note("old", { version: 1 })]);
    await pullNotes(fakeApi([note("kept", { encryptedContent: "server", version: 5 }), note("old", { version: 2 }), note("new")]), store);
    expect(store.notes.get("kept")).toMatchObject({ encryptedContent: "local", syncStatus: "pending" });
    expect(store.notes.has("gone")).toBe(false);
    expect(store.notes.get("old")!.version).toBe(2);
    expect(store.notes.get("new")!.syncStatus).toBe("synced");
  });

  test("sync pushes before pulling, and reports offline without touching local notes", async () => {
    const store = memoryStore([note("a", { syncStatus: "pending", version: 0 })]);
    const api = fakeApi([]);
    api.getNotes = async () => ({ notes: [{ ...note("a"), version: 1 }] });
    expect(await syncNotes(api, store)).toEqual({ online: true, stopped: null });
    expect(store.notes.get("a")!.syncStatus).toBe("synced");

    const offline = memoryStore([note("b", { syncStatus: "pending" })]);
    expect(await syncNotes(fakeApi([], () => new TypeError("Failed to fetch")), offline)).toEqual({ online: false, stopped: "offline" });
    expect(offline.notes.get("b")!.syncStatus).toBe("pending");
  });
});
