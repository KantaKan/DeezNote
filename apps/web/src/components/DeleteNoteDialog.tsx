import { LockSimple } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { Button } from "./ui/button";
import { Dialog, DialogHeader } from "./ui/dialog";

interface Props {
  title: string;
  excerpt: string;
  updatedAt?: string;
  locked: boolean;
  /** Returns an error message to show, or null when the note was deleted. */
  onConfirm: () => Promise<string | null>;
  onClose: () => void;
}

export function DeleteNoteDialog({ title, excerpt, updatedAt, locked, onConfirm, onClose }: Props) {
  // Destructive dialog: start on Cancel so a stray Enter doesn't delete anything.
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    setError("");
    const failure = await onConfirm();
    setBusy(false);
    if (failure) setError(failure);
    else onClose();
  }

  return <Dialog busy={busy} initialFocus={cancelRef} onClose={onClose}>{(close) =>
    <div className="p-8 sm:p-10">
      <DialogHeader busy={busy} onClose={close} />
      <h2 className="text-2xl font-semibold tracking-[-0.03em] text-neutral-950">Delete this note?</h2>
      <p className="mt-2.5 text-sm leading-6 text-neutral-500">It will be removed from every device you've synced. This can't be undone.</p>

      <div className="mt-7 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3.5">
        <strong className="flex items-center gap-1.5 truncate text-sm font-semibold text-neutral-900">
          {locked && <LockSimple size={12} weight="fill" className="shrink-0 text-amber-600" />}
          <span className="truncate">{title || "Untitled"}</span>
        </strong>
        <p className="mt-1 truncate text-xs text-neutral-500">{locked ? "Protected with a note password" : excerpt || "Empty note"}</p>
        {updatedAt && <p className="mt-2 text-[0.6875rem] text-neutral-400">Edited {new Date(updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</p>}
      </div>

      {error && <p className="mt-5 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700" role="alert">{error}</p>}
      <Button className="mt-6 h-11 w-full" variant="destructive" disabled={busy} onClick={() => void confirm()}>
        {busy ? <><span className="size-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Deleting…</> : "Delete note"}
      </Button>

      <footer className="mt-8 flex items-center justify-between gap-4 border-t border-neutral-100 pt-5 text-xs text-neutral-400">
        <span>Encrypted copies are erased too</span>
        <button ref={cancelRef} type="button" className="-mr-2 rounded-md px-2 py-1 text-neutral-500 outline-none transition hover:bg-neutral-100 hover:text-neutral-950 focus-visible:ring-2 focus-visible:ring-neutral-300 disabled:opacity-50" disabled={busy} onClick={close}>Cancel</button>
      </footer>
    </div>
  }</Dialog>;
}
