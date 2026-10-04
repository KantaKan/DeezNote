import type { EncryptedNote } from "@save-text/shared";
import Dexie, { type EntityTable } from "dexie";

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
