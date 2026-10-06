import type { NoteDocument } from "@save-text/shared";
import type { LocalNote } from "../../lib/db";

/** A note as the workspace holds it: the stored ciphertext plus its decrypted document (or a locked stub). */
export interface OpenNote {
  encrypted: LocalNote;
  document: NoteDocument;
  locked: boolean;
  protectionSalt?: string;
}

// Cmd/Ctrl+N belong to the browser (new window), so new notes use Option/Alt+N.
export const NEW_NOTE_SHORTCUT = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌥N" : "Alt+N";
