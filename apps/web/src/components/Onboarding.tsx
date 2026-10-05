import { NotePencil, Plus } from "@phosphor-icons/react";
import type { NoteDocument } from "@save-text/shared";
import { Button } from "./ui/button";

/** The first note in a new vault. Encrypted and saved like any other note; the user can edit or delete it. */
export function welcomeNote(newNoteShortcut: string): NoteDocument {
  return {
    title: "Welcome to DeezNote",
    tags: ["welcome"],
    favorite: true,
    color: "yellow",
    markdown: [
      "Everything you write here is encrypted on this device before it syncs. This note is too.",
      "## Write",
      "- Type `/` for headings, lists, quotes and code",
      "- Drop in a photo, then drag its corner to resize it",
      "- Notes save on their own as you type",
      "## Organise",
      "- Star a note to keep it under Favourites, like this one",
      "- Give a note its own page colour with the palette button",
      "- Add tags under the title, such as #ideas",
      "## Keep things private",
      "- Lock a sensitive note with its own password",
      "- Lock your vault from the sidebar when you step away. It also locks itself after 15 minutes without activity",
      `Delete this note whenever you like, and start your own with ${newNoteShortcut} or the New note button.`,
    ].join("\n\n"),
  };
}

export function EmptyState({ onNewNote, shortcut }: { onNewNote: () => void; shortcut: string }) {
  return <div className="grid min-h-[60vh] place-items-center pb-24">
    <div className="max-w-sm text-center">
      <NotePencil size={36} weight="duotone" className="mx-auto text-amber-600" />
      <h2 className="mt-6 text-2xl font-semibold tracking-[-0.03em] text-neutral-950">Write your first note</h2>
      <p className="mt-2.5 text-sm leading-6 text-neutral-500">It's encrypted on this device before it syncs, so only you can read it.</p>
      <Button className="mt-7 h-11 gap-2.5 px-5" onClick={onNewNote}>
        <Plus size={16} weight="bold" /> New note
        <kbd className="ml-1 rounded bg-white/10 px-1.5 py-0.5 font-sans text-[0.6875rem] text-neutral-400">{shortcut}</kbd>
      </Button>
    </div>
  </div>;
}
