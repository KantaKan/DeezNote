import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "./ui/button";

export interface TourStep {
  /** Matches an element's data-tour attribute. Steps whose target isn't on screen are skipped. */
  target: string;
  title: string;
  body: string;
}

const STORAGE_KEY = "deeznote-tour-done";
const GAP = 12;
const WIDTH = 288;

export function tourDone() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return true; // No storage: don't nag on every visit.
  }
}

function markDone() {
  try { localStorage.setItem(STORAGE_KEY, "1"); } catch { /* fine */ }
}

function visibleRect(target: string) {
  const element = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
  const rect = element?.getBoundingClientRect();
  if (!rect || rect.width === 0 || rect.height === 0) return null;
  if (rect.right < 0 || rect.left > innerWidth || rect.bottom < 0 || rect.top > innerHeight) return null;
  return rect;
}

/** First-run walkthrough: a highlight ring on a real control plus a small popover beside it. */
export function Tour({ steps, onDone }: { steps: TourStep[]; onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  const finish = useCallback(() => {
    markDone();
    onDone();
  }, [onDone]);

  // Find the current step's target, skipping forward past anything not on screen.
  useLayoutEffect(() => {
    let current = index;
    while (current < steps.length && !visibleRect(steps[current].target)) current++;
    if (current >= steps.length) return finish();
    if (current !== index) return setIndex(current);
    setRect(visibleRect(steps[current].target));
  }, [index, steps, finish]);

  useEffect(() => {
    const reposition = () => setRect(visibleRect(steps[index]?.target ?? ""));
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") finish(); };
    window.addEventListener("resize", reposition);
    window.addEventListener("keydown", onKey);
    nextRef.current?.focus();
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("keydown", onKey);
    };
  }, [index, steps, finish]);

  if (!rect) return null;
  const step = steps[index];
  const last = index === steps.length - 1;
  const below = rect.bottom + GAP + 170 < innerHeight;
  const left = Math.min(Math.max(16, rect.left + rect.width / 2 - WIDTH / 2), innerWidth - WIDTH - 16);

  return <>
    <div aria-hidden="true" className="pointer-events-none fixed z-50 rounded-lg ring-2 ring-amber-400 ring-offset-2 ring-offset-white transition-all duration-200" style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }} />
    <div
      role="dialog"
      aria-labelledby="tour-title"
      className="landing-rise fixed z-50 rounded-2xl border border-neutral-200 bg-white p-5 text-neutral-950 shadow-[0_18px_50px_-18px_rgb(17_17_15/0.4)]"
      style={{ width: WIDTH, left, ...(below ? { top: rect.bottom + GAP } : { bottom: innerHeight - rect.top + GAP }) }}
    >
      <p className="text-xs font-medium text-neutral-400">{index + 1} of {steps.length}</p>
      <h2 id="tour-title" className="mt-1.5 font-semibold tracking-tight">{step.title}</h2>
      <p className="mt-1.5 text-sm leading-6 text-neutral-600">{step.body}</p>
      <div className="mt-4 flex items-center justify-between">
        <button type="button" className="-ml-2 rounded-md px-2 py-1 text-sm text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900" onClick={finish}>Skip</button>
        <Button ref={nextRef} size="sm" onClick={() => (last ? finish() : setIndex(index + 1))}>{last ? "Done" : "Next"}</Button>
      </div>
    </div>
  </>;
}
