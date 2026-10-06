import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { NoteDocument } from "@save-text/shared";
import {
  createVault,
  decryptNote,
  deriveNoteProtection,
  destroyKey,
  encryptNote,
  LockedNoteError,
  unlockVault,
} from "./crypto";

const vaultPassphrase = "correct horse battery staple";
let vaultKey: Uint8Array;

beforeAll(async () => {
  const vault = await createVault(vaultPassphrase);
  vaultKey = await unlockVault(vault.envelope, vaultPassphrase);
  await destroyKey(vault.vaultKey);
});

afterAll(async () => {
  await destroyKey(vaultKey);
});

describe("vault encryption", () => {
  test("unlocks with the correct passphrase", async () => {
    const vault = await createVault(vaultPassphrase);
    const unlocked = await unlockVault(vault.envelope, vaultPassphrase);

    expect(unlocked).toEqual(vault.vaultKey);

    await destroyKey(unlocked);
    await destroyKey(vault.vaultKey);
  });

  test("rejects an incorrect passphrase", async () => {
    const vault = await createVault(vaultPassphrase);

    await expect(unlockVault(vault.envelope, "this password is incorrect")).rejects.toBeDefined();

    await destroyKey(vault.vaultKey);
  });
});

describe("note encryption", () => {
  const document: NoteDocument = {
    title: "Private plan",
    markdown: "# Secret\n\nDo not share this.",
    tags: ["private", "plans"],
  };

  test("round-trips a normal encrypted note", async () => {
    const encrypted = await encryptNote(crypto.randomUUID(), document, vaultKey, 0);
    const decrypted = await decryptNote(encrypted, vaultKey);

    expect(decrypted).toEqual(document);
    expect(encrypted.encryptedContent).not.toContain(document.title);
    expect(encrypted.encryptedContent).not.toContain("Do not share");
  });

  test("encrypts embedded image data instead of exposing it to the server", async () => {
    const imageDocument: NoteDocument = {
      title: "Image note",
      markdown: "![private](data:image/webp;base64,UklGRlBSSVZBVEVJTUFHRQ==)",
      tags: ["photo"],
    };
    const encrypted = await encryptNote(crypto.randomUUID(), imageDocument, vaultKey, 0);

    expect(encrypted.encryptedContent).not.toContain("data:image");
    expect(encrypted.encryptedContent).not.toContain("UklGRlBSSVZBVEVJTUFHRQ");
    expect(await decryptNote(encrypted, vaultKey)).toEqual(imageDocument);
  });

  test("adds an independent password layer to protected notes", async () => {
    const protection = await deriveNoteProtection("a separate note password");
    const encrypted = await encryptNote(crypto.randomUUID(), document, vaultKey, 0, protection);

    await expect(decryptNote(encrypted, vaultKey)).rejects.toBeInstanceOf(LockedNoteError);
    expect(await decryptNote(encrypted, vaultKey, protection)).toEqual(document);

    await destroyKey(protection.key);
  });

  test("rejects the wrong protected-note password", async () => {
    const correct = await deriveNoteProtection("the correct note password");
    const encrypted = await encryptNote(crypto.randomUUID(), document, vaultKey, 0, correct);
    const wrong = await deriveNoteProtection("the wrong note password", correct.salt);

    await expect(decryptNote(encrypted, vaultKey, wrong)).rejects.toBeDefined();

    await destroyKey(correct.key);
    await destroyKey(wrong.key);
  });

  test("exposes only title and tags when a protected note is locked", async () => {
    const protection = await deriveNoteProtection("another strong note password");
    const encrypted = await encryptNote(crypto.randomUUID(), document, vaultKey, 0, protection);

    try {
      await decryptNote(encrypted, vaultKey);
      throw new Error("Expected the protected note to stay locked");
    } catch (reason) {
      expect(reason).toBeInstanceOf(LockedNoteError);
      const locked = reason as LockedNoteError;
      expect(locked.title).toBe(document.title);
      expect(locked.tags).toEqual(document.tags);
      expect(locked).not.toHaveProperty("markdown");
    }

    await destroyKey(protection.key);
  });

  test("keeps favorite and color visible on a locked note, but not its content", async () => {
    const styled: NoteDocument = { ...document, favorite: true, color: "blue" };
    const protection = await deriveNoteProtection("another strong note password");
    const encrypted = await encryptNote(crypto.randomUUID(), styled, vaultKey, 0, protection);

    try {
      await decryptNote(encrypted, vaultKey);
      throw new Error("Expected the protected note to stay locked");
    } catch (reason) {
      expect(reason).toBeInstanceOf(LockedNoteError);
      const locked = reason as LockedNoteError;
      expect(locked.favorite).toBe(true);
      expect(locked.color).toBe("blue");
      expect(locked).not.toHaveProperty("markdown");
    }

    expect(await decryptNote(encrypted, vaultKey, protection)).toEqual(styled);
    await destroyKey(protection.key);
  });

  test("binds each note to its ID so the server can't swap notes", async () => {
    const first = await encryptNote(crypto.randomUUID(), { title: "First", markdown: "one", tags: [] }, vaultKey, 0);
    const second = await encryptNote(crypto.randomUUID(), { title: "Second", markdown: "two", tags: [] }, vaultKey, 0);

    // Whole envelope moved under another ID, or just the content swapped: both must fail.
    await expect(decryptNote({ ...first, id: second.id }, vaultKey)).rejects.toThrow();
    await expect(decryptNote({ ...second, encryptedContent: first.encryptedContent, contentNonce: first.contentNonce }, vaultKey)).rejects.toThrow();
    expect((await decryptNote(second, vaultKey)).title).toBe("Second");
  });

  test("still opens notes saved before ID binding", async () => {
    const sodium = (await import("libsodium-wrappers-sumo")).default;
    await sodium.ready;
    const b64 = (bytes: Uint8Array) => sodium.to_base64(bytes, sodium.base64_variants.ORIGINAL);
    const noteKey = sodium.randombytes_buf(32);
    const contentNonce = sodium.randombytes_buf(24);
    const keyNonce = sodium.randombytes_buf(24);
    const content = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(JSON.stringify({ title: "Old", markdown: "legacy", tags: [] }), null, null, contentNonce, noteKey);
    const wrapped = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(noteKey, null, null, keyNonce, vaultKey);
    const legacy = { id: crypto.randomUUID(), encryptedContent: b64(content), encryptedNoteKey: b64(wrapped), contentNonce: b64(contentNonce), keyNonce: b64(keyNonce), version: 1, updatedAt: new Date().toISOString() };

    expect(await decryptNote(legacy, vaultKey)).toEqual({ title: "Old", markdown: "legacy", tags: [] });
  });

  test("normalizes old notes that were saved before tags existed", async () => {
    const legacy = { title: "Old note", markdown: "Still readable" } as NoteDocument;
    const encrypted = await encryptNote(crypto.randomUUID(), legacy, vaultKey, 0);

    expect(await decryptNote(encrypted, vaultKey)).toEqual({
      title: "Old note",
      markdown: "Still readable",
      tags: [],
    });
  });
});
