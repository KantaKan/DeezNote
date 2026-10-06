import { Check, Crown } from "@phosphor-icons/react";
import type { Account } from "../lib/api";
import { Dialog, DialogHeader } from "./ui/dialog";

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

export type PlanReason = "note-too-large" | "storage-full" | "image-too-large";

const REASONS: Record<PlanReason, { title: string; body: string }> = {
  "note-too-large": { title: "This note is too big for Free", body: "Your change is safe on this device, but it can't sync until the note is smaller. Remove a photo or split the note." },
  "storage-full": { title: "Your storage is full", body: "Your change is safe on this device, but it can't sync until you free up space, for example by deleting notes with photos." },
  "image-too-large": { title: "That photo won't fit in this note", body: "On Free, each note can hold up to the size below. Try a smaller photo, or put it in its own note." },
};

/** Storage used vs. the plan's limits. Shared by the profile and the limit-reached dialog. */
export function StorageCard({ account }: { account: Account }) {
  const { usedBytes, totalBytes, noteBytes } = account.usage;
  const percent = Math.min(100, Math.round((usedBytes / totalBytes) * 100));
  return <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-5 py-4">
    <div className="flex items-center justify-between text-sm">
      <span className="font-medium text-neutral-800">Storage</span>
      <span className="text-neutral-500">{formatBytes(usedBytes)} of {formatBytes(totalBytes)}</span>
    </div>
    <span className="mt-2.5 block h-1.5 overflow-hidden rounded-full bg-neutral-200"><span className={`block h-full rounded-full ${percent >= 90 ? "bg-red-500" : "bg-amber-500"}`} style={{ width: `${Math.max(percent, usedBytes ? 2 : 0)}%` }} /></span>
    <p className="mt-3 text-xs text-neutral-500">Each note can be up to {formatBytes(noteBytes)}, measured after encryption.</p>
  </div>;
}

export function ProPerks() {
  return <div>
    <p className="flex items-center gap-2 font-semibold text-neutral-950"><Crown size={18} weight="duotone" className="text-amber-600" /> Pro</p>
    <ul className="mt-3 grid gap-2 text-sm text-neutral-600">
      <li className="flex gap-2"><Check size={16} weight="bold" className="mt-0.5 shrink-0 text-amber-600" />Notes up to 8 MB, room for plenty of photos</li>
      <li className="flex gap-2"><Check size={16} weight="bold" className="mt-0.5 shrink-0 text-amber-600" />1 GB of encrypted storage</li>
      <li className="flex gap-2"><Check size={16} weight="bold" className="mt-0.5 shrink-0 text-amber-600" />Same end-to-end encryption as Free</li>
    </ul>
    <p className="mt-5 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:bg-amber-50/40">Pro is coming soon. Your notes stay safe on Free in the meantime.</p>
  </div>;
}

/** Shown when a save or photo hits the plan's limits. */
export function PlanDialog({ account, reason, onClose }: { account: Account; reason: PlanReason; onClose: () => void }) {
  const intro = REASONS[reason];
  return <Dialog onClose={onClose}>{(close) =>
    <div className="p-8 sm:p-10">
      <DialogHeader onClose={close} />
      <h2 className="text-2xl font-semibold tracking-[-0.03em] text-neutral-950">{intro.title}</h2>
      <p className="mt-2.5 text-sm leading-6 text-neutral-500">{intro.body}</p>
      <div className="mt-7"><StorageCard account={account} /></div>
      {account.plan !== "pro" && <div className="mt-6"><ProPerks /></div>}
      <footer className="mt-8 flex justify-end border-t border-neutral-100 pt-5">
        <button type="button" className="-mr-2 rounded-md px-2 py-1 text-sm text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-950" onClick={close}>Close</button>
      </footer>
    </div>
  }</Dialog>;
}
