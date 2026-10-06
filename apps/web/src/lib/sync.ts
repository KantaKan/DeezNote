import type { EncryptedNote, NotePayload } from "@save-text/shared";
import { ApiError } from "./api";
import type { LocalNote } from "./db";

// Moves encrypted notes between this device (IndexedDB) and the server. Works on ciphertext only.
// Dependencies are passed in so the logic can be tested without a browser.

export interface NoteStore {
  all(): Promise<LocalNote[]>;
  put(note: LocalNote): Promise<void>;
  bulkPut(notes: LocalNote[]): Promise<void>;
  bulkDelete(ids: string[]): Promise<void>;
}

export interface SyncApi {
  getNotes(): Promise<{ notes: EncryptedNote[] }>;
  saveNote(note: NotePayload): Promise<{ version: number; updatedAt: string }>;
}

/** Why pushing stopped early, if it did: the remaining notes stay pending for the next sync. */
export type PushStop = "offline" | "rate-limited" | "over-limit" | null;

/** What the server needs to store a local note. A pending note's version is the server version it was based on. */
export function notePayload(note: LocalNote): NotePayload {
  return {
    id: note.id,
    encryptedContent: note.encryptedContent,
    encryptedNoteKey: note.encryptedNoteKey,
    contentNonce: note.contentNonce,
    keyNonce: note.keyNonce,
    baseVersion: note.version,
  };
}

/** Uploads notes saved while offline (oldest first). Conflicts are kept locally for the user to resolve. */
export async function pushPending(api: SyncApi, store: NoteStore): Promise<{ pushed: number; stopped: PushStop }> {
  const pending = (await store.all())
    .filter((note) => note.syncStatus === "pending")
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  let pushed = 0;
  for (const note of pending) {
    try {
      const result = await api.saveNote(notePayload(note));
      await store.put({ ...note, version: result.version, updatedAt: result.updatedAt, syncStatus: "synced" });
      pushed++;
    } catch (reason) {
      if (!(reason instanceof ApiError)) return { pushed, stopped: "offline" };
      if (reason.status === 409) await store.put({ ...note, syncStatus: "conflict" });
      else if (reason.status === 429) return { pushed, stopped: "rate-limited" };
      else if (reason.status === 413) return { pushed, stopped: "over-limit" };
      else return { pushed, stopped: "offline" };
    }
  }
  return { pushed, stopped: null };
}

/** Brings the server's notes down. Local unsynced edits win; synced notes deleted elsewhere are removed here. */
export async function pullNotes(api: SyncApi, store: NoteStore) {
  const remote = await api.getNotes();
  const local = await store.all();
  const unsynced = new Set(local.filter((note) => note.syncStatus !== "synced").map((note) => note.id));
  const remoteIds = new Set(remote.notes.map((note) => note.id));
  const removed = local.filter((note) => note.syncStatus === "synced" && !remoteIds.has(note.id)).map((note) => note.id);
  if (removed.length) await store.bulkDelete(removed);
  await store.bulkPut(remote.notes.filter((note) => !unsynced.has(note.id)).map((note) => ({ ...note, syncStatus: "synced" as const })));
}

/** Push, then pull. Returns whether the server was reachable and why pushing stopped, if it did. */
export async function syncNotes(api: SyncApi, store: NoteStore): Promise<{ online: boolean; stopped: PushStop }> {
  const { stopped } = await pushPending(api, store);
  if (stopped === "offline") return { online: false, stopped };
  try {
    await pullNotes(api, store);
    return { online: true, stopped };
  } catch {
    return { online: false, stopped };
  }
}
