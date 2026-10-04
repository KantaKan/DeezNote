export interface EncryptedVault {
  encryptedVaultKey: string;
  nonce: string;
  salt: string;
  kdf: "argon2id-v1";
}

export interface EncryptedNote {
  id: string;
  encryptedContent: string;
  encryptedNoteKey: string;
  contentNonce: string;
  keyNonce: string;
  version: number;
  updatedAt: string;
}

export interface NotePayload extends Omit<EncryptedNote, "version" | "updatedAt"> {
  baseVersion: number;
}

export interface NoteDocument {
  title: string;
  markdown: string;
  tags: string[];
  favorite?: boolean;
  /** One of the web app's note colour ids (e.g. "yellow"); absent means the default page colour. */
  color?: string;
}
