import type { NoteDocument } from "@save-text/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, type Account } from "../lib/api";
import { decryptNote, deriveNoteProtection, destroyKey, encryptNote, LockedNoteError, type NoteProtection } from "../lib/crypto";
import { localDb, localNoteStore, type LocalNote } from "../lib/db";
import { noteExcerpt } from "../lib/excerpt";
import { buildExportZip, downloadExport } from "../lib/export";
import { noteColorClass } from "../lib/noteColors";
import { syncNotes } from "../lib/sync";
import { useTheme } from "../lib/theme";
import { DeleteAccountDialog } from "./DeleteAccountDialog";
import { DeleteNoteDialog } from "./DeleteNoteDialog";
import { ProtectNoteDialog } from "./NoteLock";
import { EmptyState, welcomeNote } from "./Onboarding";
import { PlanDialog, type PlanReason } from "./PlanDialog";
import { ProfileDialog } from "./ProfileDialog";
import { Tour, tourDone, type TourStep } from "./Tour";
import { NoteBody } from "./workspace/NoteBody";
import { NoteToolbar } from "./workspace/NoteToolbar";
import { Sidebar } from "./workspace/Sidebar";
import { NEW_NOTE_SHORTCUT, type OpenNote } from "./workspace/types";

interface Props {
  vaultKey: Uint8Array;
  /** Right after the vault was created: seed the welcome note (once). */
  firstRun?: boolean;
  onLock: () => void;
  onLogout: () => void;
}

const AUTOSAVE_DELAY = 900;
/** After the server rate-limits a sync, try again this much later. */
const RATE_LIMIT_RETRY = 30_000;
const EMPTY_DRAFT: NoteDocument = { title: "", markdown: "", tags: [] };

const TOUR_STEPS: TourStep[] = [
  { target: "new-note", title: "Start a note", body: "Click here, or press the shortcut shown, any time. Notes save on their own as you type." },
  { target: "favourite", title: "Star and colour", body: "Starred notes stay at the top. The palette next to the star gives a note its own page colour." },
  { target: "note-lock", title: "A second lock", body: "Give a sensitive note its own password, on top of your vault passphrase." },
  { target: "profile", title: "Your profile", body: "Your plan, storage, theme and sign-out live here. The lock beside it closes your vault when you step away." },
];

const isMobile = () => window.innerWidth < 768;

/** Decrypts what's stored on this device. Notes with their own password come back as locked stubs. */
async function openStoredNotes(vaultKey: Uint8Array) {
  const encrypted = await localDb.notes.orderBy("updatedAt").reverse().toArray();
  const opened = await Promise.all(encrypted.map(async (note): Promise<OpenNote | null> => {
    try {
      return { encrypted: note, document: await decryptNote(note, vaultKey), locked: false };
    } catch (reason) {
      if (!(reason instanceof LockedNoteError)) return null;
      return {
        encrypted: note,
        document: { title: reason.title, markdown: "", tags: reason.tags, favorite: reason.favorite, color: reason.color },
        locked: true,
        protectionSalt: reason.salt,
      };
    }
  }));
  return opened.filter((note): note is OpenNote => note !== null);
}

export function NotesWorkspace({ vaultKey, firstRun = false, onLock, onLogout }: Props) {
  const [notes, setNotes] = useState<OpenNote[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const [draft, setDraft] = useState<NoteDocument>(EMPTY_DRAFT);
  const [preview, setPreview] = useState(false);
  const [query, setQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [message, setMessage] = useState("Loading encrypted notes…");
  const saveChain = useRef<Promise<void>>(Promise.resolve());
  const savesInFlight = useRef(0);
  const noteProtections = useRef(new Map<string, NoteProtection>());
  const titleRef = useRef<HTMLInputElement>(null);
  const unlockInputRef = useRef<HTMLInputElement>(null);
  const [protectDialogOpen, setProtectDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [planDialog, setPlanDialog] = useState<{ reason: PlanReason } | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  // Explain a size rejection once per note, not on every autosave retry.
  const sizeWarned = useRef(new Set<string>());
  const welcomeSeeded = useRef(false);
  const [showTour, setShowTour] = useState(() => !tourDone());
  const theme = useTheme();

  const loadNotes = useCallback(async () => {
    // Runs on the save queue, so uploading offline edits can't race a save of the same note.
    const run = saveChain.current.then(async () => {
      const { online, stopped } = await syncNotes(api, localNoteStore);
      setOnline(online);
      if (online) void api.getAccount().then(setAccount).catch(() => {});
      if (stopped === "rate-limited") window.setTimeout(() => void loadNotesRef.current(), RATE_LIMIT_RETRY);
    }).catch((reason) => console.error(reason));
    saveChain.current = run;
    await run;

    const opened = await openStoredNotes(vaultKey);
    // Keep the open note's in-memory state (an unlocked protected note, or its latest typing).
    setNotes((existing) => opened.map((note) => {
      const current = existing.find((item) => item.encrypted.id === note.encrypted.id);
      return current && !current.locked && note.locked && current.encrypted.version === note.encrypted.version ? { ...note, document: current.document, locked: false } : note;
    }));
    if (!selectedIdRef.current && opened[0]) {
      setSelectedId(opened[0].encrypted.id);
      setDraft(opened[0].document);
    }
    setMessage(opened.length ? "All changes saved" : "No notes yet. Make the first one.");
    setLoaded(true);
  }, [vaultKey]);
  const loadNotesRef = useRef(loadNotes);
  loadNotesRef.current = loadNotes;

  useEffect(() => () => {
    for (const protection of noteProtections.current.values()) void destroyKey(protection.key);
    noteProtections.current.clear();
  }, []);

  useEffect(() => {
    void loadNotes();
    // Back online: upload anything saved while offline, then refresh.
    const connected = () => { setOnline(true); void loadNotes(); };
    const disconnected = () => setOnline(false);
    window.addEventListener("online", connected);
    window.addEventListener("offline", disconnected);
    return () => {
      window.removeEventListener("online", connected);
      window.removeEventListener("offline", disconnected);
    };
  }, [loadNotes]);

  const performSave = useCallback(async (document: NoteDocument, id: string) => {
    setMessage("Encrypting…");
    const previous = await localDb.notes.get(id);
    const protection = noteProtections.current.get(id);
    const encrypted = await encryptNote(id, document, vaultKey, previous?.version ?? 0, protection);
    const local: LocalNote = { ...encrypted, syncStatus: "pending" };
    await localDb.notes.put(local);

    try {
      const result = await api.saveNote(encrypted);
      local.version = result.version;
      local.updatedAt = result.updatedAt;
      local.syncStatus = "synced";
      await localDb.notes.put(local);
      setOnline(true);
      setMessage("Encrypted and synced");
      void api.getAccount().then(setAccount).catch(() => {});
    } catch (reason) {
      local.syncStatus = reason instanceof ApiError && reason.status === 409 ? "conflict" : "pending";
      await localDb.notes.put(local);
      if (reason instanceof ApiError && reason.status === 413) {
        // Over the plan's limit: the server is reachable, the note just can't sync yet. Keep the draft locally.
        const planReason = reason.code === "STORAGE_FULL" ? "storage-full" : reason.code === "NOTE_LIMIT_REACHED" ? "note-limit" : "note-too-large";
        setMessage(planReason === "note-limit" ? "Saved on this device. Note limit reached" : "Saved on this device. Too large to sync");
        if (!sizeWarned.current.has(id)) {
          sizeWarned.current.add(id);
          setPlanDialog({ reason: planReason });
        }
      } else if (reason instanceof ApiError && reason.status === 429) {
        // Rate limited, not offline: sync again shortly.
        setMessage("Saved on this device. Syncing again shortly");
        window.setTimeout(() => void loadNotesRef.current(), RATE_LIMIT_RETRY);
      } else {
        setOnline(false);
        setMessage(local.syncStatus === "conflict" ? "Sync conflict. Your local draft is safe" : "Saved locally. Waiting to sync");
      }
    }

    const open: OpenNote = { encrypted: local, document, locked: false, protectionSalt: protection?.salt };
    setNotes((existing) => [open, ...existing.filter((note) => note.encrypted.id !== id)]);
  }, [vaultKey]);

  const queueSave = useCallback((document: NoteDocument, requestedId: string | null) => {
    const id = requestedId ?? crypto.randomUUID();
    if (!requestedId) setSelectedId(id);
    setDirty(false);
    savesInFlight.current += 1;
    setSaving(true);

    saveChain.current = saveChain.current
      .then(() => performSave(document, id))
      .catch((reason) => {
        console.error(reason);
        setMessage("Could not save this note");
      })
      .finally(() => {
        savesInFlight.current -= 1;
        if (savesInFlight.current === 0) setSaving(false);
      });
  }, [performSave]);

  // A brand-new vault starts with one real, encrypted note that explains the app. It's an ordinary note.
  useEffect(() => {
    if (!firstRun || !loaded || welcomeSeeded.current || notes.length) return;
    welcomeSeeded.current = true;
    const id = crypto.randomUUID();
    const welcome = welcomeNote(NEW_NOTE_SHORTCUT);
    setSelectedId(id);
    setDraft(welcome);
    queueSave(welcome, id);
  }, [firstRun, loaded, notes.length, queueSave]);

  useEffect(() => {
    if (!dirty) return;
    const timer = window.setTimeout(() => queueSave(draft, selectedId), AUTOSAVE_DELAY);
    return () => window.clearTimeout(timer);
  }, [dirty, draft, selectedId, queueSave]);

  // Accepts an updater so quick successive edits (tag, then star, then colour) build on the latest draft.
  function changeDraft(document: NoteDocument | ((current: NoteDocument) => NoteDocument)) {
    setDraft(document);
    setDirty(true);
    setMessage("Unsaved changes");
  }

  function selectNote(note: OpenNote) {
    // Re-selecting the open note must not reload it: its stored copy can be older than unsaved typing.
    if (note.encrypted.id === selectedId) {
      if (isMobile()) setSidebarOpen(false);
      return;
    }
    if (dirty) queueSave(draft, selectedId);
    setSelectedId(note.encrypted.id);
    setDraft(note.document);
    setDirty(false);
    setMessage(note.encrypted.syncStatus === "synced" ? "All changes saved" : note.encrypted.syncStatus);
    if (isMobile()) setSidebarOpen(false);
  }

  function newNote() {
    if (dirty) queueSave(draft, selectedId);
    setSelectedId(crypto.randomUUID());
    setDraft(EMPTY_DRAFT);
    setDirty(true);
    setMessage("Unsaved changes");
    setPreview(false);
    if (isMobile()) setSidebarOpen(false);
    requestAnimationFrame(() => titleRef.current?.focus());
  }

  const newNoteRef = useRef(newNote);
  newNoteRef.current = newNote;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey && !event.metaKey && !event.ctrlKey && event.code === "KeyN") {
        event.preventDefault();
        newNoteRef.current();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  async function deleteCurrentNote(): Promise<string | null> {
    if (!selectedId) return "Select a note first.";
    setDirty(false);
    setSaving(true);
    setMessage("Deleting…");
    await saveChain.current;
    try {
      // 404: the note never reached the server (or is already gone there), so deleting it here is enough.
      await api.deleteNote(selectedId).catch((reason) => {
        if (!(reason instanceof ApiError && reason.status === 404)) throw reason;
      });
      await localDb.notes.delete(selectedId);
      const remaining = notes.filter((note) => note.encrypted.id !== selectedId);
      setNotes(remaining);
      const next = remaining[0];
      if (next) {
        setSelectedId(next.encrypted.id);
        setDraft(next.document);
        setMessage("Note deleted");
      } else {
        setSelectedId(null);
        setDraft(EMPTY_DRAFT);
        setMessage("No notes yet. Make the first one.");
      }
      return null;
    } catch (reason) {
      console.error(reason);
      setMessage("Could not delete. Check your connection");
      return "Couldn't delete this note. Check your connection and try again.";
    } finally {
      setSaving(false);
    }
  }

  async function protectCurrentNote(password: string): Promise<string | null> {
    if (!selectedId) return "Select a note first.";
    setMessage("Adding strict note protection…");
    try {
      const protection = await deriveNoteProtection(password);
      noteProtections.current.set(selectedId, protection);
      setNotes((existing) => existing.map((note) => note.encrypted.id === selectedId ? { ...note, protectionSalt: protection.salt } : note));
      queueSave(draft, selectedId);
      await saveChain.current;
      setMessage("Note password enabled");
      return null;
    } catch (reason) {
      console.error(reason);
      setMessage("Could not protect this note");
      return "Could not lock this note. Please try again.";
    }
  }

  async function unlockCurrentNote(note: OpenNote, password: string): Promise<string | null> {
    if (!note.protectionSalt) return "This note has no password.";

    setSaving(true);
    setMessage("Unlocking note…");
    let protection: NoteProtection | undefined;
    try {
      protection = await deriveNoteProtection(password, note.protectionSalt);
      const document = await decryptNote(note.encrypted, vaultKey, protection);
      noteProtections.current.set(note.encrypted.id, protection);
      setNotes((existing) => existing.map((item) => item.encrypted.id === note.encrypted.id ? { ...item, document, locked: false } : item));
      setDraft(document);
      setMessage("Protected note unlocked");
      return null;
    } catch {
      if (protection) await destroyKey(protection.key);
      setMessage("Note remains locked");
      return "Wrong password. Try again.";
    } finally {
      setSaving(false);
    }
  }

  /** Zips every unlocked note (the open one with its latest unsaved typing) and downloads it. */
  function exportNotes() {
    const unlocked = notes.filter((note) => !note.locked);
    downloadExport(buildExportZip(unlocked.map((note) => ({
      document: note.encrypted.id === selectedId ? draft : note.document,
      updatedAt: note.encrypted.updatedAt,
    }))));
    return { exported: unlocked.length, skipped: notes.length - unlocked.length };
  }

  async function lockCurrentNote(note: OpenNote) {
    const protection = noteProtections.current.get(note.encrypted.id);
    if (!protection) return;
    if (dirty) queueSave(draft, note.encrypted.id);
    await saveChain.current;
    const latest = await localDb.notes.get(note.encrypted.id);
    noteProtections.current.delete(note.encrypted.id);
    await destroyKey(protection.key);
    const locked: OpenNote = {
      ...note,
      encrypted: latest ?? note.encrypted,
      document: { title: draft.title, markdown: "", tags: draft.tags, favorite: draft.favorite, color: draft.color },
      locked: true,
      protectionSalt: protection.salt,
    };
    setNotes((existing) => existing.map((item) => item.encrypted.id === note.encrypted.id ? locked : item));
    setDraft(locked.document);
    setDirty(false);
    setMessage("Note locked");
  }

  // Favourite/colour also update the sidebar right away instead of waiting for the autosave round-trip.
  function updateNoteMeta(patch: Pick<NoteDocument, "favorite" | "color">) {
    changeDraft((current) => ({ ...current, ...patch }));
    setNotes((existing) => existing.map((note) => note.encrypted.id === selectedId ? { ...note, document: { ...note.document, ...patch } } : note));
  }

  const currentNote = notes.find((note) => note.encrypted.id === selectedId);
  const hasNotePassword = Boolean(currentNote?.protectionSalt || (selectedId && noteProtections.current.has(selectedId)));
  const email = account?.email ?? localStorage.getItem("save-text-email") ?? "";

  function canInsertImage(dataUrlBytes: number) {
    if (!account) return true; // Offline or unknown plan: the server still enforces the limit.
    // Encryption stores the note as base64, about 4/3 of the plain JSON size.
    const estimate = Math.ceil((JSON.stringify(draft).length + dataUrlBytes) * 4 / 3) + 512;
    if (estimate <= account.usage.noteBytes) return true;
    setPlanDialog({ reason: "image-too-large" });
    return false;
  }

  return <div className="flex h-screen overflow-hidden bg-white text-neutral-950">
    <Sidebar
      notes={notes}
      selectedId={selectedId}
      query={query}
      onQueryChange={setQuery}
      open={sidebarOpen}
      onClose={() => setSidebarOpen(false)}
      online={online}
      email={email}
      onSelect={selectNote}
      onNewNote={newNote}
      onLock={onLock}
      onOpenProfile={() => setProfileOpen(true)}
    />

    <main className={`note-page min-w-0 flex-1 ${noteColorClass(draft.color)}`}>
      <NoteToolbar
        draft={draft}
        status={saving ? "Saving…" : message}
        dirty={dirty}
        preview={preview}
        onPreviewChange={setPreview}
        onToggleSidebar={() => setSidebarOpen((open) => !open)}
        metaDisabled={!selectedId || Boolean(currentNote?.locked)}
        onMetaChange={updateNoteMeta}
        actionsDisabled={!selectedId || saving}
        lock={currentNote?.locked ? "locked" : hasNotePassword ? "protected" : "none"}
        onLockClick={() => {
          if (currentNote?.locked) unlockInputRef.current?.focus();
          else if (currentNote && hasNotePassword) void lockCurrentNote(currentNote);
          else setProtectDialogOpen(true);
        }}
        onDelete={() => setDeleteDialogOpen(true)}
      />

      <section className="mx-auto h-[calc(100vh-3.5rem)] max-w-[850px] overflow-y-auto px-6 pt-12 sm:px-12 sm:pt-16">
        {loaded && !notes.length && !selectedId
          ? <EmptyState onNewNote={newNote} shortcut={NEW_NOTE_SHORTCUT} />
          : <NoteBody
            noteKey={selectedId ?? "new-note"}
            draft={draft}
            lockedNote={currentNote?.locked ? currentNote : undefined}
            preview={preview}
            titleRef={titleRef}
            unlockInputRef={unlockInputRef}
            onChange={changeDraft}
            onUnlock={(password) => currentNote ? unlockCurrentNote(currentNote, password) : Promise.resolve("Select a note first.")}
            canInsertImage={canInsertImage}
          />}
      </section>
    </main>
    {deleteDialogOpen && <DeleteNoteDialog
      title={draft.title}
      excerpt={noteExcerpt(draft.markdown, 120)}
      updatedAt={currentNote?.encrypted.updatedAt}
      locked={Boolean(currentNote?.locked)}
      onConfirm={deleteCurrentNote}
      onClose={() => setDeleteDialogOpen(false)}
    />}
    {/* Wait for the first load (and the welcome note) so the tour points at a populated workspace. */}
    {showTour && loaded && (!firstRun || notes.length > 0) && <Tour steps={TOUR_STEPS} onDone={() => setShowTour(false)} />}
    {planDialog && account && <PlanDialog account={account} reason={planDialog.reason} onClose={() => setPlanDialog(null)} />}
    {profileOpen && <ProfileDialog
      email={email}
      account={account}
      theme={theme.preference}
      onThemeChange={theme.set}
      onExport={exportNotes}
      onSignOut={onLogout}
      onDeleteAccount={() => { setProfileOpen(false); setDeleteAccountOpen(true); }}
      onClose={() => setProfileOpen(false)}
    />}
    {deleteAccountOpen && <DeleteAccountDialog onDeleted={onLogout} onClose={() => setDeleteAccountOpen(false)} />}
    {protectDialogOpen && <ProtectNoteDialog noteTitle={draft.title} onSubmit={protectCurrentNote} onClose={() => setProtectDialogOpen(false)} />}
  </div>;
}
