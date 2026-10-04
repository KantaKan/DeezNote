import type { EncryptedNote, EncryptedVault, NoteDocument } from "@save-text/shared";
import sodium from "libsodium-wrappers-sumo";

const KEY_BYTES = 32;
const PROTECTED_NOTE_TYPE = "deeznote-password-v1";

export interface NoteProtection {
  key: Uint8Array;
  salt: string;
}

interface ProtectedNotePayload {
  _type: typeof PROTECTED_NOTE_TYPE;
  title: string;
  tags: string[];
  salt: string;
  nonce: string;
  ciphertext: string;
}

export class LockedNoteError extends Error {
  constructor(
    readonly title: string,
    readonly tags: string[],
    readonly salt: string,
  ) {
    super("This note requires its own password");
    this.name = "LockedNoteError";
  }
}

async function ready() {
  await sodium.ready;
  return sodium;
}

function encode(bytes: Uint8Array) {
  return sodium.to_base64(bytes, sodium.base64_variants.ORIGINAL);
}

function decode(value: string) {
  return sodium.from_base64(value, sodium.base64_variants.ORIGINAL);
}

async function derivePassphraseKey(passphrase: string, salt: Uint8Array) {
  const s = await ready();
  return s.crypto_pwhash(
    KEY_BYTES,
    passphrase,
    salt,
    s.crypto_pwhash_OPSLIMIT_INTERACTIVE,
    s.crypto_pwhash_MEMLIMIT_INTERACTIVE,
    s.crypto_pwhash_ALG_ARGON2ID13,
  );
}

function seal(message: Uint8Array, key: Uint8Array) {
  const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(message, null, null, nonce, key);
  return { ciphertext, nonce };
}

function open(ciphertext: Uint8Array, nonce: Uint8Array, key: Uint8Array) {
  return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, ciphertext, null, nonce, key);
}

function normalizeDocument(value: unknown): NoteDocument {
  const document = value && typeof value === "object" ? value as Partial<NoteDocument> : {};
  return {
    title: typeof document.title === "string" ? document.title : "Untitled",
    markdown: typeof document.markdown === "string" ? document.markdown : "",
    tags: Array.isArray(document.tags) ? document.tags.filter((tag): tag is string => typeof tag === "string") : [],
  };
}

function isProtectedPayload(value: unknown): value is ProtectedNotePayload {
  if (!value || typeof value !== "object") return false;
  return (value as Partial<ProtectedNotePayload>)._type === PROTECTED_NOTE_TYPE;
}

export async function createVault(passphrase: string) {
  const s = await ready();
  const salt = s.randombytes_buf(s.crypto_pwhash_SALTBYTES);
  const vaultKey = s.randombytes_buf(KEY_BYTES);
  const passphraseKey = await derivePassphraseKey(passphrase, salt);
  const wrapped = seal(vaultKey, passphraseKey);
  s.memzero(passphraseKey);

  return {
    vaultKey,
    envelope: {
      encryptedVaultKey: encode(wrapped.ciphertext),
      nonce: encode(wrapped.nonce),
      salt: encode(salt),
      kdf: "argon2id-v1",
    } satisfies EncryptedVault,
  };
}

export async function unlockVault(envelope: EncryptedVault, passphrase: string) {
  const s = await ready();
  const passphraseKey = await derivePassphraseKey(passphrase, decode(envelope.salt));
  try {
    return open(decode(envelope.encryptedVaultKey), decode(envelope.nonce), passphraseKey);
  } finally {
    s.memzero(passphraseKey);
  }
}

export async function deriveNoteProtection(password: string, existingSalt?: string): Promise<NoteProtection> {
  const s = await ready();
  const salt = existingSalt ? decode(existingSalt) : s.randombytes_buf(s.crypto_pwhash_SALTBYTES);
  return { key: await derivePassphraseKey(password, salt), salt: encode(salt) };
}

export async function encryptNote(
  id: string,
  document: NoteDocument,
  vaultKey: Uint8Array,
  baseVersion: number,
  protection?: NoteProtection,
): Promise<EncryptedNote & { baseVersion: number }> {
  const s = await ready();
  const noteKey = s.randombytes_buf(KEY_BYTES);
  let payload: NoteDocument | ProtectedNotePayload = document;

  if (protection) {
    const protectedContent = seal(new TextEncoder().encode(JSON.stringify(document)), protection.key);
    payload = {
      _type: PROTECTED_NOTE_TYPE,
      title: document.title,
      tags: document.tags,
      salt: protection.salt,
      nonce: encode(protectedContent.nonce),
      ciphertext: encode(protectedContent.ciphertext),
    };
  }

  const sealedContent = seal(new TextEncoder().encode(JSON.stringify(payload)), noteKey);
  const wrappedKey = seal(noteKey, vaultKey);
  s.memzero(noteKey);

  return {
    id,
    encryptedContent: encode(sealedContent.ciphertext),
    encryptedNoteKey: encode(wrappedKey.ciphertext),
    contentNonce: encode(sealedContent.nonce),
    keyNonce: encode(wrappedKey.nonce),
    baseVersion,
    version: baseVersion,
    updatedAt: new Date().toISOString(),
  };
}

export async function decryptNote(
  note: EncryptedNote,
  vaultKey: Uint8Array,
  protection?: NoteProtection,
): Promise<NoteDocument> {
  const s = await ready();
  const noteKey = open(decode(note.encryptedNoteKey), decode(note.keyNonce), vaultKey);
  try {
    const plaintext = open(decode(note.encryptedContent), decode(note.contentNonce), noteKey);
    const payload = JSON.parse(new TextDecoder().decode(plaintext)) as unknown;
    if (!isProtectedPayload(payload)) return normalizeDocument(payload);
    if (!protection || protection.salt !== payload.salt) {
      throw new LockedNoteError(payload.title, payload.tags, payload.salt);
    }
    const protectedPlaintext = open(decode(payload.ciphertext), decode(payload.nonce), protection.key);
    return normalizeDocument(JSON.parse(new TextDecoder().decode(protectedPlaintext)));
  } finally {
    s.memzero(noteKey);
  }
}

export async function destroyKey(key: Uint8Array | null) {
  if (!key) return;
  const s = await ready();
  s.memzero(key);
}
