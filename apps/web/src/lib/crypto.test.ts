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
  type NoteProtection,
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
