import { CloudCheck, List, LockKey, MagnifyingGlass, NotePencil, Plus, Star, WifiSlash, X } from "@phosphor-icons/react";
import { useMemo } from "react";
import { noteExcerpt } from "../../lib/excerpt";
import { Logo } from "../Logo";
import { NoteCard, NoteSectionLabel } from "../NoteCard";
import { Avatar } from "../ProfileDialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { NEW_NOTE_SHORTCUT, type OpenNote } from "./types";

interface Props {
  notes: OpenNote[];
  selectedId: string | null;
  query: string;
  onQueryChange: (query: string) => void;
  open: boolean;
  onClose: () => void;
  online: boolean;
  email: string;
  onSelect: (note: OpenNote) => void;
  onNewNote: () => void;
  onLock: () => void;
  onOpenProfile: () => void;
}

export function Sidebar({ notes, selectedId, query, onQueryChange, open, onClose, online, email, onSelect, onNewNote, onLock, onOpenProfile }: Props) {
  const visibleNotes = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return notes;
    return notes.filter((note) => `${note.document.title}\n${note.document.markdown}\n${note.document.tags.join(" ")}`.toLowerCase().includes(search));
  }, [notes, query]);
  const favoriteNotes = visibleNotes.filter((note) => note.document.favorite);
  const otherNotes = visibleNotes.filter((note) => !note.document.favorite);

  const renderNote = (note: OpenNote) => <NoteCard
    key={note.encrypted.id}
    title={note.document.title}
    excerpt={noteExcerpt(note.document.markdown, 82)}
    tags={note.document.tags}
    favorite={note.document.favorite}
    color={note.document.color}
    locked={note.locked}
    dateLabel={new Date(note.encrypted.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
    statusLabel={note.encrypted.syncStatus === "synced" ? "Saved" : note.encrypted.syncStatus}
    conflict={note.encrypted.syncStatus === "conflict"}
    selected={selectedId === note.encrypted.id}
    onSelect={() => onSelect(note)}
  />;

  return <>
    {open && <button className="fixed inset-0 z-20 bg-black/20 backdrop-blur-[1px] md:hidden" aria-label="Close sidebar" onClick={onClose} />}
    <aside className={`fixed inset-y-0 left-0 z-30 shrink-0 overflow-hidden border-r border-neutral-200 bg-neutral-50 transition-[transform,width] duration-200 md:relative ${open ? "w-[310px] translate-x-0" : "w-[310px] -translate-x-full md:w-0"}`}>
      <div className="grid h-full w-[310px] grid-rows-[auto_auto_auto_1fr_auto]">
        <header className="flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2.5"><Logo /><strong className="text-[0.9375rem] tracking-[-.01em]">DeezNote</strong></div>
          <Button className="md:hidden" variant="ghost" size="icon-sm" title="Close sidebar" onClick={onClose}><X size={17} /></Button>
        </header>

        <Button data-tour="new-note" className="mx-3 mb-3 justify-start gap-2.5 px-3 shadow-sm" title={`New note (${NEW_NOTE_SHORTCUT})`} onClick={onNewNote}>
          <Plus size={16} weight="bold" />
          New note
          <kbd className="ml-auto rounded bg-white/10 px-1.5 py-0.5 font-sans text-[0.6875rem] text-neutral-400">{NEW_NOTE_SHORTCUT}</kbd>
        </Button>

        <div className="relative mx-3 mb-4">
          <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-neutral-400" size={15} />
          <Input className="h-9 border-transparent bg-neutral-200/70 pl-9 shadow-none focus:border-neutral-300 focus:bg-white focus:ring-0" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search notes" />
        </div>
        <div className="overflow-y-auto px-2 pb-3">
          {favoriteNotes.length > 0 && <div className="mb-3">
            <NoteSectionLabel icon={<Star size={13} weight="fill" className="text-amber-500" />} label="Favourites" count={favoriteNotes.length} />
            {favoriteNotes.map(renderNote)}
          </div>}
          {otherNotes.length > 0 && <>
            <NoteSectionLabel icon={<List size={13} weight="bold" />} label={favoriteNotes.length ? "Other notes" : "All notes"} count={otherNotes.length} />
            {otherNotes.map(renderNote)}
          </>}
          {!visibleNotes.length && <div className="px-5 py-14 text-center"><NotePencil className="mx-auto mb-3 text-neutral-300" size={30} weight="duotone" /><p className="text-sm font-medium text-neutral-600">{query ? "No matching notes" : "No notes yet"}</p><span className="mt-1 block text-xs leading-5 text-neutral-400">{query ? "Try another search." : "Create a note to start writing."}</span></div>}
        </div>

        <footer className="flex h-14 items-center justify-between border-t border-neutral-200 px-3">
          <span className={`flex items-center gap-1.5 text-[0.6875rem] font-medium ${online ? "text-emerald-600" : "text-orange-600"}`}>{online ? <CloudCheck size={15} weight="duotone" /> : <WifiSlash size={15} weight="duotone" />}{online ? "Synced" : "Offline"}</span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" title="Lock vault" onClick={onLock}><LockKey size={16} /></Button>
            <button type="button" data-tour="profile" className="grid size-8 place-items-center rounded-full transition hover:ring-2 hover:ring-amber-300/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400" title="Your profile" onClick={onOpenProfile}>
              <Avatar email={email} className="size-7 text-xs" />
            </button>
          </div>
        </footer>
      </div>
    </aside>
  </>;
}
