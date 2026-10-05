import { CloudCheck, Desktop, List, LockKey, LockSimple, LockSimpleOpen, MagnifyingGlass, Moon, NotePencil, Password, Plus, ShareNetwork, SignOut, SidebarSimple, Star, Sun, Tag, Trash, WifiSlash, X } from "@phosphor-icons/react";
import type { NoteDocument } from "@save-text/shared";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "../lib/api";
import { decryptNote, deriveNoteProtection, destroyKey, encryptNote, LockedNoteError, type NoteProtection } from "../lib/crypto";
import { localDb, type LocalNote } from "../lib/db";
import { noteColorClass } from "../lib/noteColors";
import { useTheme } from "../lib/theme";
import { DeleteNoteDialog } from "./DeleteNoteDialog";
import { Logo } from "./Logo";
import { NoteColorPicker } from "./NoteColorPicker";
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
  onLock: () => void;
  onLogout: () => void;
}

const MarkdownEditor = lazy(async () => {
  const module = await import("./MarkdownEditor");
  return { default: module.MarkdownEditor };
});

const AUTOSAVE_DELAY = 900;

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

const TAG_COLORS = [
  "bg-red-50 text-red-700 hover:bg-red-100",
  "bg-orange-50 text-orange-700 hover:bg-orange-100",
  "bg-amber-50 text-amber-700 hover:bg-amber-100",
  "bg-lime-50 text-lime-700 hover:bg-lime-100",
  "bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
  "bg-cyan-50 text-cyan-700 hover:bg-cyan-100",
  "bg-blue-50 text-blue-700 hover:bg-blue-100",
  "bg-violet-50 text-violet-700 hover:bg-violet-100",
  "bg-pink-50 text-pink-700 hover:bg-pink-100",
] as const;

function tagColor(tag: string) {
  const hash = Array.from(tag.toLowerCase()).reduce((value, character) => ((value * 31) + character.charCodeAt(0)) >>> 0, 0);
  return TAG_COLORS[hash % TAG_COLORS.length];
}

export function NotesWorkspace({ vaultKey, onLock, onLogout }: Props) {
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
  const theme = useTheme();

  const loadNotes = useCallback(async () => {
    try {
      const remote = await api.getNotes();
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
    } catch (reason) {
      local.syncStatus = reason instanceof ApiError && reason.status === 409 ? "conflict" : "pending";
      await localDb.notes.put(local);
      setOnline(false);
      setMessage(local.syncStatus === "conflict" ? "Sync conflict—your local draft is safe" : "Saved locally—waiting to sync");
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
      setMessage("Could not delete—check your connection");
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

  const renderNoteItem = (note: OpenNote) => {
    const selected = selectedId === note.encrypted.id;
    const colorClass = noteColorClass(note.document.color);
    const surface = colorClass
      ? `${colorClass} note-card ${selected ? "shadow-sm ring-1 ring-neutral-900/15" : "hover:ring-1 hover:ring-neutral-900/10"}`
      : selected ? "bg-white shadow-sm ring-1 ring-neutral-900/[.07]" : "hover:bg-neutral-200/60";
    return <button key={note.encrypted.id} className={`mb-1 grid w-full gap-1 rounded-xl px-3 py-3 text-left transition ${surface}`} onClick={() => selectNote(note)}>
      <strong className="flex items-center gap-1.5 truncate text-[0.8125rem] font-semibold">
        {note.locked && <LockSimple size={12} weight="fill" className="shrink-0 text-amber-600" />}
        <span className="truncate">{note.document.title || "Untitled"}</span>
        {note.document.favorite && <Star size={12} weight="fill" className="ml-auto shrink-0 text-amber-500" />}
      </strong>
      <span className="truncate text-xs text-neutral-500">{note.locked ? "Locked with a note password" : note.document.markdown.replace(/!\[[^\]]*\]\(data:[^)]+\)/g, "Photo").replace(/[#*_>`]/g, "").slice(0, 82) || "Empty note"}</span>
      {note.document.tags.length > 0 && <span className="flex gap-1 overflow-hidden pt-0.5">{note.document.tags.slice(0, 3).map((tag) => <span key={tag} className={`truncate rounded px-1.5 py-0.5 text-[0.5625rem] font-medium ${tagColor(tag)}`}>#{tag}</span>)}</span>}
      <small className="mt-1 flex items-center justify-between text-[0.625rem] text-neutral-400"><time>{new Date(note.encrypted.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</time><span className={note.encrypted.syncStatus === "conflict" ? "text-red-500" : ""}>{note.encrypted.syncStatus === "synced" ? "Saved" : note.encrypted.syncStatus}</span></small>
    </button>;
  };
  const sectionLabel = (icon: React.ReactNode, label: string, count: number) =>
    <div className="flex items-center justify-between px-2 pb-2 pt-1 text-[0.6875rem] font-semibold uppercase tracking-[.08em] text-neutral-400"><span className="flex items-center gap-1.5">{icon} {label}</span><span>{count}</span></div>;
  const hasNotePassword = Boolean(currentNote?.protectionSalt || (selectedId && noteProtections.current.has(selectedId)));

  return <div className="flex h-screen overflow-hidden bg-white text-neutral-950">
    {sidebarOpen && <button className="fixed inset-0 z-20 bg-black/20 backdrop-blur-[1px] md:hidden" aria-label="Close sidebar" onClick={() => setSidebarOpen(false)} />}
    <aside className={`fixed inset-y-0 left-0 z-30 shrink-0 overflow-hidden border-r border-neutral-200 bg-neutral-50 transition-[transform,width] duration-200 md:relative ${sidebarOpen ? "w-[310px] translate-x-0" : "w-[310px] -translate-x-full md:w-0"}`}>
      <div className="grid h-full w-[310px] grid-rows-[auto_auto_auto_1fr_auto]">
        <header className="flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2.5"><Logo /><strong className="text-[0.9375rem] tracking-[-.01em]">DeezNote</strong></div>
          <Button className="md:hidden" variant="ghost" size="icon-sm" title="Close sidebar" onClick={() => setSidebarOpen(false)}><X size={17} /></Button>
        </header>

        <Button className="mx-3 mb-3 justify-start gap-2.5 px-3 shadow-sm" title={`New note (${NEW_NOTE_SHORTCUT})`} onClick={newNote}>
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
            {sectionLabel(<Star size={13} weight="fill" className="text-amber-500" />, "Favourites", favoriteNotes.length)}
            {favoriteNotes.map(renderNoteItem)}
          </div>}
          {otherNotes.length > 0 && <>
            {sectionLabel(<List size={13} weight="bold" />, favoriteNotes.length ? "Other notes" : "All notes", otherNotes.length)}
            {otherNotes.map(renderNoteItem)}
          </>}
          {!visibleNotes.length && <div className="px-5 py-14 text-center"><NotePencil className="mx-auto mb-3 text-neutral-300" size={30} weight="duotone" /><p className="text-sm font-medium text-neutral-600">{query ? "No matching notes" : "No notes yet"}</p><span className="mt-1 block text-xs leading-5 text-neutral-400">{query ? "Try another search." : "Create a note to start writing."}</span></div>}
        </div>

        <footer className="flex h-14 items-center justify-between border-t border-neutral-200 px-3">
          <span className={`flex items-center gap-1.5 text-[0.6875rem] font-medium ${online ? "text-emerald-600" : "text-orange-600"}`}>{online ? <CloudCheck size={15} weight="duotone" /> : <WifiSlash size={15} weight="duotone" />}{online ? "Synced" : "Offline"}</span>
          <div className="flex"><Button variant="ghost" size="icon-sm" title={`Theme: ${theme.preference === "system" ? "System" : theme.preference === "dark" ? "Dark" : "Light"} (click to change)`} onClick={theme.cycle}>{theme.preference === "system" ? <Desktop size={16} /> : theme.preference === "dark" ? <Moon size={16} /> : <Sun size={16} />}</Button><Button variant="ghost" size="icon-sm" title="Lock vault" onClick={onLock}><LockKey size={16} /></Button><Button variant="ghost" size="icon-sm" title="Sign out" onClick={onLogout}><SignOut size={16} /></Button></div>
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
        <input ref={titleRef} className="w-full border-0 bg-transparent text-6xl font-bold leading-[.98] tracking-[-.055em] text-neutral-950 outline-none placeholder:text-neutral-300 disabled:cursor-default sm:text-7xl lg:text-8xl" value={draft.title} onChange={(event) => changeDraft({ ...draft, title: event.target.value })} placeholder="Untitled" disabled={currentNote?.locked} />
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
                <MarkdownEditor key={selectedId ?? "new-note"} initialValue={draft.markdown} onChange={(markdown) => changeDraft({ ...draft, markdown })} />
              </Suspense>
            </div>}
      </section>
    </main>
    {deleteDialogOpen && <DeleteNoteDialog
      title={draft.title}
      excerpt={draft.markdown.replace(/!\[[^\]]*\]\(data:[^)]+\)/g, "Photo").replace(/[#*_>`]/g, "").trim().slice(0, 120)}
      updatedAt={currentNote?.encrypted.updatedAt}
      locked={Boolean(currentNote?.locked)}
      onConfirm={deleteCurrentNote}
      onClose={() => setDeleteDialogOpen(false)}
    />}
    {protectDialogOpen && <ProtectNoteDialog noteTitle={draft.title} onSubmit={protectCurrentNote} onClose={() => setProtectDialogOpen(false)} />}
  </div>;
}
