import { LockSimple, LockSimpleOpen, Password, ShareNetwork, SidebarSimple, Star, Trash } from "@phosphor-icons/react";
import type { NoteDocument } from "@save-text/shared";
import { NoteColorPicker } from "../NoteColorPicker";
import { Button } from "../ui/button";

interface Props {
  draft: NoteDocument;
  status: string;
  dirty: boolean;
  preview: boolean;
  onPreviewChange: (preview: boolean) => void;
  onToggleSidebar: () => void;
  /** Favourite and colour can't change while no note is open or the note is locked. */
  metaDisabled: boolean;
  onMetaChange: (patch: Pick<NoteDocument, "favorite" | "color">) => void;
  /** Lock, delete: off while no note is open or a save is running. */
  actionsDisabled: boolean;
  lock: "locked" | "protected" | "none";
  onLockClick: () => void;
  onDelete: () => void;
}

export function NoteToolbar({ draft, status, dirty, preview, onPreviewChange, onToggleSidebar, metaDisabled, onMetaChange, actionsDisabled, lock, onLockClick, onDelete }: Props) {
  const tab = (active: boolean) => `rounded-md px-2.5 py-1.5 transition ${active ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"}`;
  return <header className="flex h-14 items-center justify-between border-b border-neutral-900/[.06] px-3 sm:px-5">
    <div className="flex min-w-0 items-center gap-2">
      <Button variant="ghost" size="icon-sm" title="Toggle sidebar" onClick={onToggleSidebar}><SidebarSimple size={19} /></Button>
      <span className="hidden truncate text-xs text-neutral-400 sm:block">Notes <b className="px-1 font-normal text-neutral-300">/</b> <span className="text-neutral-600">{draft.title || "Untitled"}</span></span>
    </div>
    <div className="flex items-center gap-2 sm:gap-3">
      <span className={`hidden text-[0.6875rem] sm:block ${dirty ? "text-amber-600" : "text-neutral-400"}`}>{status}</span>
      <div className="flex rounded-lg bg-neutral-100 p-0.5 text-xs">
        <button className={tab(!preview)} onClick={() => onPreviewChange(false)}>Edit</button>
        <button className={tab(preview)} onClick={() => onPreviewChange(true)}>Preview</button>
      </div>
      <Button
        data-tour="favourite"
        className={draft.favorite ? "text-amber-500 hover:bg-amber-50 hover:text-amber-600" : "text-neutral-400"}
        variant="ghost"
        size="icon-sm"
        disabled={metaDisabled}
        title={draft.favorite ? "Remove from favourites" : "Add to favourites"}
        aria-pressed={Boolean(draft.favorite)}
        onClick={() => onMetaChange({ favorite: !draft.favorite })}
      ><Star size={17} weight={draft.favorite ? "fill" : "regular"} /></Button>
      <NoteColorPicker value={draft.color} disabled={metaDisabled} onChange={(color) => onMetaChange({ color })} />
      <Button
        data-tour="note-lock"
        className={lock === "none" ? "text-neutral-400" : "text-amber-600 hover:bg-amber-50 hover:text-amber-700"}
        variant="ghost"
        size="icon-sm"
        disabled={actionsDisabled}
        title={lock === "locked" ? "Unlock protected note" : lock === "protected" ? "Lock protected note" : "Lock note with a password"}
        onClick={onLockClick}
      >{lock === "locked" ? <LockSimpleOpen size={17} /> : lock === "protected" ? <LockSimple size={17} weight="fill" /> : <Password size={18} />}</Button>
      <Button className="text-neutral-400 hover:bg-red-50 hover:text-red-600" variant="ghost" size="icon-sm" disabled={actionsDisabled} title="Delete note" onClick={onDelete}><Trash size={17} /></Button>
      <Button variant="outline" size="sm" disabled title="Encrypted sharing is coming next"><ShareNetwork size={15} /> <span className="hidden sm:inline">Share</span></Button>
    </div>
  </header>;
}
