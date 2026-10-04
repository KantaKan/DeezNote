import { X } from "@phosphor-icons/react";
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { Logo } from "../Logo";
import { Button } from "./button";

interface DialogProps {
  /** While busy, Esc and backdrop clicks are ignored. */
  busy?: boolean;
  /** Element to focus on open; showModal() would otherwise focus the first focusable (usually the close button). */
  initialFocus?: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: (close: () => void) => ReactNode;
}

export function Dialog({ busy = false, initialFocus, onClose, children }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const close = () => dialogRef.current?.close();

  useEffect(() => {
    dialogRef.current?.showModal();
    initialFocus?.current?.focus();
  }, [initialFocus]);

  return <dialog
    ref={dialogRef}
    className="m-auto w-[calc(100%-2rem)] max-w-md rounded-3xl border border-neutral-200 bg-white p-0 text-neutral-950 shadow-[0_24px_80px_-32px_rgba(0,0,0,.35)] backdrop:bg-neutral-950/25 backdrop:backdrop-blur-[2px]"
    onCancel={(event) => { if (busy) event.preventDefault(); }}
    onClose={onClose}
    onClick={(event) => { if (event.target === dialogRef.current && !busy) close(); }}
  >
    {children(close)}
  </dialog>;
}

/** Brand row matching the vault card: logo + name on the left, close on the right. */
export function DialogHeader({ busy = false, onClose }: { busy?: boolean; onClose: () => void }) {
  return <header className="mb-10 flex items-center justify-between gap-4">
    <div className="flex items-center gap-2.5 text-[0.9375rem] font-semibold tracking-[-.01em]"><Logo className="size-7" /> DeezNote</div>
    <Button type="button" className="-mr-2" variant="ghost" size="icon-sm" title="Close" disabled={busy} onClick={onClose}><X size={16} /></Button>
  </header>;
}
