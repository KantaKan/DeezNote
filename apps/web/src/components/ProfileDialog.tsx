import { Crown, Desktop, DownloadSimple, Moon, SignOut, Sun } from "@phosphor-icons/react";
import { useState } from "react";
import type { Account } from "../lib/api";
import type { ThemePreference } from "../lib/theme";
import { ProPerks, StorageCard } from "./PlanDialog";
import { Dialog, DialogHeader } from "./ui/dialog";

const THEMES: { id: ThemePreference; label: string; icon: typeof Sun }[] = [
  { id: "system", label: "System", icon: Desktop },
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
];

export function Avatar({ email, className = "" }: { email: string; className?: string }) {
  return <span aria-hidden="true" className={`grid shrink-0 place-items-center rounded-full bg-amber-400 font-semibold uppercase text-amber-950 ${className}`}>{email.slice(0, 1) || "?"}</span>;
}

export function PlanBadge({ plan }: { plan: Account["plan"] }) {
  return plan === "pro"
    ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800"><Crown size={12} weight="fill" /> Pro</span>
    : <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">Free</span>;
}

interface Props {
  email: string;
  /** Null while offline: plan and storage can't be shown. */
  account: Account | null;
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
  /** Downloads every open note as Markdown; returns how many were exported and how many stayed locked. */
  onExport: () => { exported: number; skipped: number };
  onSignOut: () => void;
  onDeleteAccount: () => void;
  onClose: () => void;
}

export function ProfileDialog({ email, account, theme, onThemeChange, onExport, onSignOut, onDeleteAccount, onClose }: Props) {
  const [exportResult, setExportResult] = useState<string | null>(null);

  function exportNotes() {
    try {
      const { exported, skipped } = onExport();
      const notes = `${exported} ${exported === 1 ? "note" : "notes"}`;
      setExportResult(skipped
        ? `Exported ${notes}. ${skipped} locked ${skipped === 1 ? "note was" : "notes were"} left out: open ${skipped === 1 ? "it" : "them"} with ${skipped === 1 ? "its" : "their"} password first to include ${skipped === 1 ? "it" : "them"}.`
        : `Exported ${notes}.`);
    } catch {
      setExportResult("Export failed. Try again.");
    }
  }

  return <Dialog onClose={onClose}>{(close) =>
    <div className="p-8 sm:p-10">
      <DialogHeader onClose={close} />

      <div className="flex items-center gap-4">
        <Avatar email={email} className="size-12 text-lg" />
        <div className="min-w-0">
          <p className="truncate font-semibold text-neutral-950" title={email}>{email}</p>
          <div className="mt-1">{account ? <PlanBadge plan={account.plan} /> : <span className="text-xs text-neutral-400">Plan shows when you're online</span>}</div>
        </div>
      </div>

      {account && <div className="mt-7"><StorageCard account={account} /></div>}
      {account?.plan === "free" && <div className="mt-6"><ProPerks /></div>}

      <div className="mt-7">
        <p className="text-sm font-medium text-neutral-800">Appearance</p>
        <div className="mt-2.5 grid grid-cols-3 gap-1 rounded-lg bg-neutral-100 p-1" role="radiogroup" aria-label="Theme">
          {THEMES.map(({ id, label, icon: Icon }) => <button
            key={id}
            type="button"
            role="radio"
            aria-checked={theme === id}
            className={`flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium transition ${theme === id ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-800"}`}
            onClick={() => onThemeChange(id)}
          ><Icon size={15} /> {label}</button>)}
        </div>
      </div>

      <div className="mt-7">
        <p className="text-sm font-medium text-neutral-800">Your notes</p>
        <p className="mt-1 text-sm text-neutral-500">Download a .zip of Markdown files with photos. It's made on this device, so your notes stay private.</p>
        <button type="button" className="mt-3 inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium text-neutral-800 ring-1 ring-neutral-300 transition hover:bg-neutral-100 active:translate-y-px" onClick={exportNotes}><DownloadSimple size={16} /> Export notes</button>
        {exportResult && <p role="status" className="mt-2.5 text-sm text-neutral-600">{exportResult}</p>}
      </div>

      <footer className="mt-8 flex items-center justify-between gap-4 border-t border-neutral-100 pt-5 text-sm">
        <div className="flex items-center gap-4 text-xs text-neutral-500">
          <a href="/privacy" target="_blank" rel="noreferrer" className="hover:text-neutral-900">Privacy</a>
          <a href="/terms" target="_blank" rel="noreferrer" className="hover:text-neutral-900">Terms</a>
          <button type="button" className="text-red-600 hover:text-red-700" onClick={onDeleteAccount}>Delete account</button>
        </div>
        <button type="button" className="-mr-2 flex items-center gap-1.5 rounded-md px-2 py-1 font-medium text-neutral-700 transition hover:bg-neutral-100 hover:text-neutral-950" onClick={onSignOut}><SignOut size={15} /> Sign out</button>
      </footer>
    </div>
  }</Dialog>;
}
