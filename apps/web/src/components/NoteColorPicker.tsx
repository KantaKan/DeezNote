import { Check, Palette } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { NOTE_COLORS } from "../lib/noteColors";
import { Button } from "./ui/button";

interface Props {
  value: string | undefined;
  disabled?: boolean;
  onChange: (color: string | undefined) => void;
}

export function NoteColorPicker({ value, disabled, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = NOTE_COLORS.find((option) => option.id === value);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function choose(color: string | undefined) {
    onChange(color);
    setOpen(false);
  }

  return <div ref={rootRef} className="relative">
    <Button
      className="relative text-neutral-400"
      variant="ghost"
      size="icon-sm"
      disabled={disabled}
      title="Note colour"
      aria-expanded={open}
      onClick={() => setOpen((isOpen) => !isOpen)}
    >
      <Palette size={18} />
      {current && <span className="absolute bottom-1 right-1 size-2 rounded-full ring-2 ring-white" style={{ background: current.swatch }} />}
    </Button>

    {open && <div className="absolute right-0 top-10 z-40 w-[232px] rounded-2xl border border-neutral-200 bg-white p-3 shadow-[0_16px_48px_-16px_rgba(0,0,0,.3)]" role="menu">
      <p className="px-1 pb-2.5 text-[0.6875rem] font-medium text-neutral-500">Page colour</p>
      <div className="grid grid-cols-5 gap-2">
        <Swatch label="Default" selected={!current} onClick={() => choose(undefined)}>
          <span className="size-full rounded-full border border-neutral-300 bg-white" />
        </Swatch>
        {NOTE_COLORS.map((option) => <Swatch key={option.id} label={option.label} selected={current?.id === option.id} onClick={() => choose(option.id)}>
          <span className="size-full rounded-full" style={{ background: option.swatch }} />
        </Swatch>)}
      </div>
    </div>}
  </div>;
}

function Swatch({ label, selected, onClick, children }: { label: string; selected: boolean; onClick: () => void; children: ReactNode }) {
  return <button
    type="button"
    role="menuitemradio"
    aria-checked={selected}
    title={label}
    className={`relative grid size-9 place-items-center rounded-full p-1 transition hover:scale-110 ${selected ? "ring-2 ring-neutral-900" : ""}`}
    onClick={onClick}
  >
    {children}
    {selected && <Check className="absolute" color="#171717" size={14} weight="bold" />}
  </button>;
}
