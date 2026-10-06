import type { EncryptedNote } from "@save-text/shared";
import Dexie, { type EntityTable } from "dexie";
import type { NoteStore } from "./sync";

export interface LocalNote extends EncryptedNote {
  syncStatus: "synced" | "pending" | "conflict";
}

class SaveTextDatabase extends Dexie {
  notes!: EntityTable<LocalNote, "id">;

  constructor() {
    super("save-text");
    this.version(1).stores({
      notes: "id, updatedAt, syncStatus",
    });
  }
}

export const localDb = new SaveTextDatabase();

/** The device's note store, in the shape the sync logic expects. */
export const localNoteStore: NoteStore = {
  all: () => localDb.notes.toArray(),
  put: async (note) => { await localDb.notes.put(note); },
  bulkPut: async (notes) => { await localDb.notes.bulkPut(notes); },
  bulkDelete: (ids) => localDb.notes.bulkDelete(ids),
};
