import { CloudCheck, List, LockKey, LockSimple, LockSimpleOpen, MagnifyingGlass, NotePencil, Password, Plus, ShareNetwork, SidebarSimple, Star, Tag, Trash, WifiSlash, X } from "@phosphor-icons/react";
import type { NoteDocument } from "@save-text/shared";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, type Account } from "../lib/api";
import { decryptNote, deriveNoteProtection, destroyKey, encryptNote, LockedNoteError, type NoteProtection } from "../lib/crypto";
import { buildExportZip, downloadExport } from "../lib/export";
import { localDb, type LocalNote } from "../lib/db";
import { noteColorClass } from "../lib/noteColors";
import { useTheme } from "../lib/theme";
import { DeleteAccountDialog } from "./DeleteAccountDialog";
import { DeleteNoteDialog } from "./DeleteNoteDialog";
import { Logo } from "./Logo";
import { NoteCard, NoteSectionLabel, tagColor } from "./NoteCard";
import { NoteColorPicker } from "./NoteColorPicker";
import { PlanDialog, type PlanReason } from "./PlanDialog";
import { Avatar, ProfileDialog } from "./ProfileDialog";
import { EmptyState, welcomeNote } from "./Onboarding";
import { Tour, tourDone, type TourStep } from "./Tour";
import { ProtectNoteDialog, UnlockNoteCard } from "./NoteLock";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

interface OpenNote {
  encrypted: LocalNote;
  document: NoteDocument;
  locked: boolean;
  protectionSalt?: string;
}

interface Props {
  vaultKey: Uint8Array;
  /** Right after the vault was created: seed the welcome note (once). */
  firstRun?: boolean;
  onLock: () => void;
  onLogout: () => void;
}

const MarkdownEditor = lazy(async () => {
  const module = await import("./MarkdownEditor");
  return { default: module.MarkdownEditor };
});

const AUTOSAVE_DELAY = 900;

/** Preview text for a note: photos become "Photo", empty image placeholders disappear. */
function noteExcerpt(markdown: string) {
  return markdown.replace(/!\[[^\]]*\]\(data:[^)]+\)/g, "Photo").replace(/!\[[^\]]*\]\(\s*\)/g, "").replace(/\s+/g, " ").trim();
}

const TOUR_STEPS: TourStep[] = [
  { target: "new-note", title: "Start a note", body: "Click here, or press the shortcut shown, any time. Notes save on their own as you type." },
  { target: "favourite", title: "Star and colour", body: "Starred notes stay at the top. The palette next to the star gives a note its own page colour." },
  { target: "note-lock", title: "A second lock", body: "Give a sensitive note its own password, on top of your vault passphrase." },
  { target: "profile", title: "Your profile", body: "Your plan, storage, theme and sign-out live here. The lock beside it closes your vault when you step away." },
];

// The editor saves an image's resize ratio as its alt text (e.g. `![0.62](…)`); apply it in preview too.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName !== "IMG") return;
  const ratio = Number(node.getAttribute("alt"));
  if (!node.getAttribute("alt") || Number.isNaN(ratio) || ratio <= 0) return;
  node.setAttribute("style", `width: ${Math.min(ratio, 1) * 100}%`);
  node.setAttribute("alt", "");
});

// Cmd/Ctrl+N belong to the browser (new window), so new notes use Option/Alt+N.
const NEW_NOTE_SHORTCUT = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌥N" : "Alt+N";


export function NotesWorkspace({ vaultKey, firstRun = false, onLock, onLogout }: Props) {
  const [notes, setNotes] = useState<OpenNote[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<NoteDocument>({ title: "", markdown: "", tags: [] });
  const [tagInput, setTagInput] = useState("");
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
    try {
      const remote = await api.getNotes();
      void api.getAccount().then(setAccount).catch(() => {});
      const pendingIds = new Set((await localDb.notes.where("syncStatus").anyOf("pending", "conflict").toArray()).map((n) => n.id));
      const remoteIds = new Set(remote.notes.map((note) => note.id));
      const removedOnServer = (await localDb.notes.where("syncStatus").equals("synced").toArray())
        .filter((note) => !remoteIds.has(note.id))
        .map((note) => note.id);
      if (removedOnServer.length) await localDb.notes.bulkDelete(removedOnServer);
      await localDb.notes.bulkPut(remote.notes.filter((n) => !pendingIds.has(n.id)).map((n) => ({ ...n, syncStatus: "synced" as const })));
      setOnline(true);
    } catch {
      setOnline(false);
    }

    const encrypted = await localDb.notes.orderBy("updatedAt").reverse().toArray();
    const opened = (await Promise.all(encrypted.map(async (note): Promise<OpenNote | null> => {
      try {
        return { encrypted: note, document: await decryptNote(note, vaultKey), locked: false };
      } catch (reason) {
        if (reason instanceof LockedNoteError) {
          return {
            encrypted: note,
            document: { title: reason.title, markdown: "", tags: reason.tags, favorite: reason.favorite, color: reason.color },
            locked: true,
            protectionSalt: reason.salt,
          };
        }
        return null;
      }
    }))).filter((note): note is OpenNote => note !== null);
    setNotes(opened);
    if (opened[0]) {
      setSelectedId((current) => current ?? opened[0].encrypted.id);
      setDraft(opened[0].document);
    }
    setMessage(opened.length ? "All changes saved" : "No notes yet. Make the first one.");
    setLoaded(true);
  }, [vaultKey]);

  useEffect(() => () => {
    for (const protection of noteProtections.current.values()) void destroyKey(protection.key);
    noteProtections.current.clear();
  }, []);

  useEffect(() => {
    void loadNotes();
    const connected = () => setOnline(true);
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
        // Rate limited, not offline: the next save retries.
        setMessage("Saved on this device. Syncing again shortly");
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
    if (dirty) queueSave(draft, selectedId);
    setSelectedId(note.encrypted.id);
    setDraft(note.document);
    setDirty(false);
    setMessage(note.encrypted.syncStatus === "synced" ? "All changes saved" : note.encrypted.syncStatus);
    if (window.innerWidth <= 760) setSidebarOpen(false);
  }

  function newNote() {
    if (dirty) queueSave(draft, selectedId);
    setSelectedId(crypto.randomUUID());
    setDraft({ title: "", markdown: "", tags: [] });
    setDirty(true);
    setMessage("Unsaved changes");
    setPreview(false);
    if (window.innerWidth <= 760) setSidebarOpen(false);
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
      await api.deleteNote(selectedId);
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
        setDraft({ title: "", markdown: "", tags: [] });
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

  function addTag(value: string) {
    const tag = value.trim().replace(/^#/, "").slice(0, 24);
    setTagInput("");
    if (!tag || draft.tags.length >= 8 || draft.tags.some((existing) => existing.toLowerCase() === tag.toLowerCase())) return;
    changeDraft((current) => ({ ...current, tags: [...current.tags, tag] }));
  }

  function removeTag(tag: string) {
    changeDraft((current) => ({ ...current, tags: current.tags.filter((existing) => existing !== tag) }));
  }

  const rendered = useMemo(
    () => DOMPurify.sanitize(marked.parse(draft.markdown, { async: false }) as string),
    [draft.markdown],
  );

  const visibleNotes = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return notes;
    return notes.filter((note) => `${note.document.title}\n${note.document.markdown}\n${note.document.tags.join(" ")}`.toLowerCase().includes(search));
  }, [notes, query]);
  const favoriteNotes = visibleNotes.filter((note) => note.document.favorite);
  const otherNotes = visibleNotes.filter((note) => !note.document.favorite);
  const currentNote = notes.find((note) => note.encrypted.id === selectedId);
  const metaLocked = !selectedId || Boolean(currentNote?.locked);

  const renderNoteItem = (note: OpenNote) => <NoteCard
    key={note.encrypted.id}
    title={note.document.title}
    excerpt={noteExcerpt(note.document.markdown).replace(/[#*_>`]/g, "").slice(0, 82)}
    tags={note.document.tags}
    favorite={note.document.favorite}
    color={note.document.color}
    locked={note.locked}
    dateLabel={new Date(note.encrypted.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
    statusLabel={note.encrypted.syncStatus === "synced" ? "Saved" : note.encrypted.syncStatus}
    conflict={note.encrypted.syncStatus === "conflict"}
    selected={selectedId === note.encrypted.id}
    onSelect={() => selectNote(note)}
  />;
  const hasNotePassword = Boolean(currentNote?.protectionSalt || (selectedId && noteProtections.current.has(selectedId)));

  return <div className="flex h-screen overflow-hidden bg-white text-neutral-950">
    {sidebarOpen && <button className="fixed inset-0 z-20 bg-black/20 backdrop-blur-[1px] md:hidden" aria-label="Close sidebar" onClick={() => setSidebarOpen(false)} />}
    <aside className={`fixed inset-y-0 left-0 z-30 shrink-0 overflow-hidden border-r border-neutral-200 bg-neutral-50 transition-[transform,width] duration-200 md:relative ${sidebarOpen ? "w-[310px] translate-x-0" : "w-[310px] -translate-x-full md:w-0"}`}>
      <div className="grid h-full w-[310px] grid-rows-[auto_auto_auto_1fr_auto]">
        <header className="flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2.5"><Logo /><strong className="text-[0.9375rem] tracking-[-.01em]">DeezNote</strong></div>
          <Button className="md:hidden" variant="ghost" size="icon-sm" title="Close sidebar" onClick={() => setSidebarOpen(false)}><X size={17} /></Button>
        </header>

        <Button data-tour="new-note" className="mx-3 mb-3 justify-start gap-2.5 px-3 shadow-sm" title={`New note (${NEW_NOTE_SHORTCUT})`} onClick={newNote}>
          <Plus size={16} weight="bold" />
          New note
          <kbd className="ml-auto rounded bg-white/10 px-1.5 py-0.5 font-sans text-[0.6875rem] text-neutral-400">{NEW_NOTE_SHORTCUT}</kbd>
        </Button>

        <div className="relative mx-3 mb-4">
          <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-neutral-400" size={15} />
          <Input className="h-9 border-transparent bg-neutral-200/70 pl-9 shadow-none focus:border-neutral-300 focus:bg-white focus:ring-0" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search notes" />
        </div>
        <div className="overflow-y-auto px-2 pb-3">
          {favoriteNotes.length > 0 && <div className="mb-3">
            <NoteSectionLabel icon={<Star size={13} weight="fill" className="text-amber-500" />} label="Favourites" count={favoriteNotes.length} />
            {favoriteNotes.map(renderNoteItem)}
          </div>}
          {otherNotes.length > 0 && <>
            <NoteSectionLabel icon={<List size={13} weight="bold" />} label={favoriteNotes.length ? "Other notes" : "All notes"} count={otherNotes.length} />
            {otherNotes.map(renderNoteItem)}
          </>}
          {!visibleNotes.length && <div className="px-5 py-14 text-center"><NotePencil className="mx-auto mb-3 text-neutral-300" size={30} weight="duotone" /><p className="text-sm font-medium text-neutral-600">{query ? "No matching notes" : "No notes yet"}</p><span className="mt-1 block text-xs leading-5 text-neutral-400">{query ? "Try another search." : "Create a note to start writing."}</span></div>}
        </div>

        <footer className="flex h-14 items-center justify-between border-t border-neutral-200 px-3">
          <span className={`flex items-center gap-1.5 text-[0.6875rem] font-medium ${online ? "text-emerald-600" : "text-orange-600"}`}>{online ? <CloudCheck size={15} weight="duotone" /> : <WifiSlash size={15} weight="duotone" />}{online ? "Synced" : "Offline"}</span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" title="Lock vault" onClick={onLock}><LockKey size={16} /></Button>
            <button type="button" data-tour="profile" className="grid size-8 place-items-center rounded-full transition hover:ring-2 hover:ring-amber-300/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400" title="Your profile" onClick={() => setProfileOpen(true)}>
              <Avatar email={(account?.email ?? localStorage.getItem("save-text-email") ?? "")} className="size-7 text-xs" />
            </button>
          </div>
        </footer>
      </div>
    </aside>

    <main className={`note-page min-w-0 flex-1 ${noteColorClass(draft.color)}`}>
      <header className="flex h-14 items-center justify-between border-b border-neutral-900/[.06] px-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="icon-sm" title="Toggle sidebar" onClick={() => setSidebarOpen((open) => !open)}><SidebarSimple size={19} /></Button>
          <span className="hidden truncate text-xs text-neutral-400 sm:block">Notes <b className="px-1 font-normal text-neutral-300">/</b> <span className="text-neutral-600">{draft.title || "Untitled"}</span></span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <span className={`hidden text-[0.6875rem] sm:block ${dirty ? "text-amber-600" : "text-neutral-400"}`}>{saving ? "Saving…" : message}</span>
          <div className="flex rounded-lg bg-neutral-100 p-0.5 text-xs"><button className={`rounded-md px-2.5 py-1.5 transition ${!preview ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"}`} onClick={() => setPreview(false)}>Edit</button><button className={`rounded-md px-2.5 py-1.5 transition ${preview ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"}`} onClick={() => setPreview(true)}>Preview</button></div>
          <Button
            data-tour="favourite"
            className={draft.favorite ? "text-amber-500 hover:bg-amber-50 hover:text-amber-600" : "text-neutral-400"}
            variant="ghost"
            size="icon-sm"
            disabled={metaLocked}
            title={draft.favorite ? "Remove from favourites" : "Add to favourites"}
            aria-pressed={Boolean(draft.favorite)}
            onClick={() => updateNoteMeta({ favorite: !draft.favorite })}
          ><Star size={17} weight={draft.favorite ? "fill" : "regular"} /></Button>
          <NoteColorPicker value={draft.color} disabled={metaLocked} onChange={(color) => updateNoteMeta({ color })} />
          <Button
            data-tour="note-lock"
            className={hasNotePassword ? "text-amber-600 hover:bg-amber-50 hover:text-amber-700" : "text-neutral-400"}
            variant="ghost"
            size="icon-sm"
            disabled={!selectedId || saving}
            title={currentNote?.locked ? "Unlock protected note" : hasNotePassword ? "Lock protected note" : "Lock note with a password"}
            onClick={() => {
              if (currentNote?.locked) unlockInputRef.current?.focus();
              else if (currentNote && hasNotePassword) void lockCurrentNote(currentNote);
              else setProtectDialogOpen(true);
            }}
          >{currentNote?.locked ? <LockSimpleOpen size={17} /> : hasNotePassword ? <LockSimple size={17} weight="fill" /> : <Password size={18} />}</Button>
          <Button className="text-neutral-400 hover:bg-red-50 hover:text-red-600" variant="ghost" size="icon-sm" disabled={!selectedId || saving} title="Delete note" onClick={() => setDeleteDialogOpen(true)}><Trash size={17} /></Button>
          <Button variant="outline" size="sm" disabled title="Encrypted sharing is coming next"><ShareNetwork size={15} /> <span className="hidden sm:inline">Share</span></Button>
        </div>
      </header>

      <section className="mx-auto h-[calc(100vh-3.5rem)] max-w-[850px] overflow-y-auto px-6 pt-12 sm:px-12 sm:pt-16">
        {loaded && !notes.length && !selectedId ? <EmptyState onNewNote={newNote} shortcut={NEW_NOTE_SHORTCUT} /> : <>
        <input ref={titleRef} className="w-full border-0 bg-transparent text-4xl font-bold leading-[1.05] tracking-[-.045em] text-neutral-950 outline-none placeholder:text-neutral-300 disabled:cursor-default sm:text-5xl lg:text-6xl" value={draft.title} onChange={(event) => changeDraft({ ...draft, title: event.target.value })} placeholder="Untitled" disabled={currentNote?.locked} />
        <div className="mt-3 text-[0.6875rem] text-neutral-400">Encrypted note <span className="px-1 text-neutral-300">·</span> Autosaves as you write</div>
        <div className="mt-5 flex min-h-8 flex-wrap items-center gap-1.5">
          <Tag className="mr-1 text-neutral-300" size={16} weight="duotone" />
          {draft.tags.map((tag) => <button key={tag} className={`group inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition ${tagColor(tag)}`} title={currentNote?.locked ? `#${tag}` : `Remove #${tag}`} disabled={currentNote?.locked} onClick={() => removeTag(tag)}>#{tag}{!currentNote?.locked && <X className="opacity-40 group-hover:opacity-100" size={11} weight="bold" />}</button>)}
          {!currentNote?.locked && draft.tags.length < 8 && <input
            className="h-7 w-24 border-0 bg-transparent px-1 text-xs text-neutral-600 outline-none placeholder:text-neutral-300"
            value={tagInput}
            onChange={(event) => setTagInput(event.target.value.replace(/[,#]/g, ""))}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === ",") {
                event.preventDefault();
                addTag(tagInput);
              } else if (event.key === "Backspace" && !tagInput && draft.tags.length) {
                removeTag(draft.tags[draft.tags.length - 1]);
              }
            }}
            placeholder="Add tag…"
            aria-label="Add tag"
          />}
        </div>
        {currentNote?.locked
          ? <UnlockNoteCard key={currentNote.encrypted.id} ref={unlockInputRef} updatedAt={currentNote.encrypted.updatedAt} onSubmit={(password) => unlockCurrentNote(currentNote, password)} />
          : preview
            ? <article className="markdown-preview pb-28 pt-10" dangerouslySetInnerHTML={{ __html: rendered }} />
            : <div className="mt-8">
              <Suspense fallback={<div className="py-8 text-sm text-neutral-400">Loading editor…</div>}>
                <MarkdownEditor
                  key={selectedId ?? "new-note"}
                  initialValue={draft.markdown}
                  onChange={(markdown) => changeDraft({ ...draft, markdown })}
                  canInsertImage={(dataUrlBytes) => {
                    if (!account) return true; // Offline or unknown plan: the server still enforces the limit.
                    // Encryption stores the note as base64, about 4/3 of the plain JSON size.
                    const estimate = Math.ceil((JSON.stringify(draft).length + dataUrlBytes) * 4 / 3) + 512;
                    if (estimate <= account.usage.noteBytes) return true;
                    setPlanDialog({ reason: "image-too-large" });
                    return false;
                  }}
                />
              </Suspense>
            </div>}
        </>}
      </section>
    </main>
    {deleteDialogOpen && <DeleteNoteDialog
      title={draft.title}
      excerpt={noteExcerpt(draft.markdown).replace(/[#*_>`]/g, "").trim().slice(0, 120)}
      updatedAt={currentNote?.encrypted.updatedAt}
      locked={Boolean(currentNote?.locked)}
      onConfirm={deleteCurrentNote}
      onClose={() => setDeleteDialogOpen(false)}
    />}
    {/* Wait for the first load (and the welcome note) so the tour points at a populated workspace. */}
    {showTour && loaded && (!firstRun || notes.length > 0) && <Tour steps={TOUR_STEPS} onDone={() => setShowTour(false)} />}
    {planDialog && account && <PlanDialog account={account} reason={planDialog.reason} onClose={() => setPlanDialog(null)} />}
    {profileOpen && <ProfileDialog
      email={(account?.email ?? localStorage.getItem("save-text-email") ?? "")}
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
