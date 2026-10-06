import { Tag, X } from "@phosphor-icons/react";
import type { NoteDocument } from "@save-text/shared";
import { lazy, Suspense, useMemo, useState, type Ref } from "react";
import { renderMarkdown } from "../../lib/markdown";
import { tagColor } from "../NoteCard";
import { UnlockNoteCard } from "../NoteLock";
import type { OpenNote } from "./types";

const MarkdownEditor = lazy(async () => {
  const module = await import("../MarkdownEditor");
  return { default: module.MarkdownEditor };
});

const MAX_TAGS = 8;

interface Props {
  /** Remounts the editor when the open note changes. */
  noteKey: string;
  draft: NoteDocument;
  /** Set when the open note is still locked with its own password. */
  lockedNote?: OpenNote;
  preview: boolean;
  titleRef: Ref<HTMLInputElement>;
  unlockInputRef: Ref<HTMLInputElement>;
  onChange: (update: (current: NoteDocument) => NoteDocument) => void;
  onUnlock: (password: string) => Promise<string | null>;
  canInsertImage: (dataUrlBytes: number) => boolean;
}

function TagEditor({ tags, disabled, onChange }: { tags: string[]; disabled: boolean; onChange: (tags: string[]) => void }) {
  const [input, setInput] = useState("");

  function add(value: string) {
    const tag = value.trim().replace(/^#/, "").slice(0, 24);
    setInput("");
    if (!tag || tags.length >= MAX_TAGS || tags.some((existing) => existing.toLowerCase() === tag.toLowerCase())) return;
    onChange([...tags, tag]);
  }

  return <div className="mt-5 flex min-h-8 flex-wrap items-center gap-1.5">
    <Tag className="mr-1 text-neutral-300" size={16} weight="duotone" />
    {tags.map((tag) => <button key={tag} className={`group inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition ${tagColor(tag)}`} title={disabled ? `#${tag}` : `Remove #${tag}`} disabled={disabled} onClick={() => onChange(tags.filter((existing) => existing !== tag))}>#{tag}{!disabled && <X className="opacity-40 group-hover:opacity-100" size={11} weight="bold" />}</button>)}
    {!disabled && tags.length < MAX_TAGS && <input
      className="h-7 w-24 border-0 bg-transparent px-1 text-xs text-neutral-600 outline-none placeholder:text-neutral-300"
      value={input}
      onChange={(event) => setInput(event.target.value.replace(/[,#]/g, ""))}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === ",") {
          event.preventDefault();
          add(input);
        } else if (event.key === "Backspace" && !input && tags.length) {
          onChange(tags.slice(0, -1));
        }
      }}
      placeholder="Add tag…"
      aria-label="Add tag"
    />}
  </div>;
}

export function NoteBody({ noteKey, draft, lockedNote, preview, titleRef, unlockInputRef, onChange, onUnlock, canInsertImage }: Props) {
  const locked = Boolean(lockedNote);
  const rendered = useMemo(() => preview ? renderMarkdown(draft.markdown) : "", [preview, draft.markdown]);

  return <>
    <input ref={titleRef} className="w-full border-0 bg-transparent text-4xl font-bold leading-[1.05] tracking-[-.045em] text-neutral-950 outline-none placeholder:text-neutral-300 disabled:cursor-default sm:text-5xl lg:text-6xl" value={draft.title} onChange={(event) => { const title = event.target.value; onChange((current) => ({ ...current, title })); }} placeholder="Untitled" disabled={locked} />
    <div className="mt-3 text-[0.6875rem] text-neutral-400">Encrypted note <span className="px-1 text-neutral-300">·</span> Autosaves as you write</div>
    <TagEditor tags={draft.tags} disabled={locked} onChange={(tags) => onChange((current) => ({ ...current, tags }))} />
    {lockedNote
      ? <UnlockNoteCard key={lockedNote.encrypted.id} ref={unlockInputRef} updatedAt={lockedNote.encrypted.updatedAt} onSubmit={onUnlock} />
      : preview
        ? <article className="markdown-preview pb-28 pt-10" dangerouslySetInnerHTML={{ __html: rendered }} />
        : <div className="mt-8">
          <Suspense fallback={<div className="py-8 text-sm text-neutral-400">Loading editor…</div>}>
            <MarkdownEditor key={noteKey} initialValue={draft.markdown} onChange={(markdown) => onChange((current) => ({ ...current, markdown }))} canInsertImage={canInsertImage} />
          </Suspense>
        </div>}
  </>;
}
