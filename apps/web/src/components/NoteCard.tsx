import { LockSimple, Star } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { noteColorClass } from "../lib/noteColors";

// The sidebar note card. Used by the app and, unchanged, by the landing page's live preview.

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

export function tagColor(tag: string) {
  const hash = Array.from(tag.toLowerCase()).reduce((value, character) => ((value * 31) + character.charCodeAt(0)) >>> 0, 0);
  return TAG_COLORS[hash % TAG_COLORS.length];
}

export interface NoteCardProps {
  title: string;
  excerpt: string;
  tags: string[];
  favorite?: boolean;
  color?: string;
  locked?: boolean;
  dateLabel: string;
  statusLabel: string;
  conflict?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  /** When set, the star becomes a button (the landing preview); in the app it's only an indicator. */
  onToggleFavorite?: () => void;
}

export function NoteCard({ title, excerpt, tags, favorite, color, locked, dateLabel, statusLabel, conflict, selected, onSelect, onToggleFavorite }: NoteCardProps) {
  const colorClass = noteColorClass(color);
  const surface = colorClass
    ? `${colorClass} note-card ${selected ? "shadow-sm ring-1 ring-neutral-900/15" : "hover:ring-1 hover:ring-neutral-900/10"}`
    : selected ? "bg-white shadow-sm ring-1 ring-neutral-900/[.07]" : "hover:bg-neutral-200/60";
  const className = `mb-1 grid w-full gap-1 rounded-xl px-3 py-3 text-left transition ${surface}`;

  const body = <>
    <strong className="flex items-center gap-1.5 truncate text-[0.8125rem] font-semibold">
      {locked && <LockSimple size={12} weight="fill" className="shrink-0 text-amber-600" />}
      <span className="truncate">{title || "Untitled"}</span>
      {onToggleFavorite
        ? <button type="button" aria-pressed={Boolean(favorite)} title={favorite ? "Remove from favourites" : "Add to favourites"} className="-my-1 -mr-1 ml-auto grid size-6 shrink-0 place-items-center rounded-md transition hover:bg-neutral-900/5 active:scale-90" onClick={onToggleFavorite}>
            <Star size={13} weight={favorite ? "fill" : "regular"} className={favorite ? "text-amber-500" : "text-neutral-400"} />
          </button>
        : favorite && <Star size={12} weight="fill" className="ml-auto shrink-0 text-amber-500" />}
    </strong>
    <span className="truncate text-xs text-neutral-500">{locked ? "Locked with a note password" : excerpt || "Empty note"}</span>
    {tags.length > 0 && <span className="flex gap-1 overflow-hidden pt-0.5">{tags.slice(0, 3).map((tag) => <span key={tag} className={`truncate rounded px-1.5 py-0.5 text-[0.5625rem] font-medium ${tagColor(tag)}`}>#{tag}</span>)}</span>}
    <small className="mt-1 flex items-center justify-between text-[0.625rem] text-neutral-400"><time>{dateLabel}</time><span className={conflict ? "text-red-500" : ""}>{statusLabel}</span></small>
  </>;

  // A card with its own star button can't itself be a <button> (no nested buttons).
  return onSelect && !onToggleFavorite
    ? <button type="button" className={className} onClick={onSelect}>{body}</button>
    : <div className={className}>{body}</div>;
}

export function NoteSectionLabel({ icon, label, count }: { icon: ReactNode; label: string; count: number }) {
  return <div className="flex items-center justify-between px-2 pb-2 pt-1 text-[0.6875rem] font-semibold uppercase tracking-[.08em] text-neutral-400"><span className="flex items-center gap-1.5">{icon} {label}</span><span>{count}</span></div>;
}
