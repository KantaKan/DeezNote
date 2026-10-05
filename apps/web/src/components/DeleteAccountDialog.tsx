import { Eye, EyeSlash, Warning } from "@phosphor-icons/react";
import { useRef, useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import { Button } from "./ui/button";
import { Dialog, DialogHeader } from "./ui/dialog";
import { Input } from "./ui/input";

interface Props {
  onDeleted: () => void;
  onClose: () => void;
}

/** Self-service account erasure (PDPA): the server deletes the account, vault, notes and sessions. */
export function DeleteAccountDialog({ onDeleted, onClose }: Props) {
  const passwordRef = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const email = localStorage.getItem("save-text-email");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError("");
    try {
      await api.deleteAccount(password);
      onDeleted();
    } catch (reason) {
      setBusy(false);
      setPassword("");
      setError(reason instanceof ApiError && reason.status === 403 ? "Wrong password. Try again."
        : reason instanceof ApiError && reason.status === 429 ? "Too many attempts. Wait a few minutes and try again."
          : "Couldn't delete your account. Check your connection and try again.");
    }
  }

  return <Dialog busy={busy} initialFocus={passwordRef} onClose={onClose}>{(close) =>
    <form className="p-8 sm:p-10" onSubmit={submit}>
      <DialogHeader busy={busy} onClose={close} />
      <h2 className="text-2xl font-semibold tracking-[-0.03em] text-neutral-950">Delete your account?</h2>
      <p className="mt-2.5 text-sm leading-6 text-neutral-500">
        This permanently deletes {email ? <span className="font-medium text-neutral-700">{email}</span> : "your account"}, your vault and every note from our server, and clears them from this device. It can't be undone.
      </p>

      <label className="mt-7 grid gap-2 text-sm font-medium text-neutral-700">
        Account password
        <div className="relative">
          <Input ref={passwordRef} type={visible ? "text" : "password"} className={error ? "pr-10 border-red-300 focus:border-red-400 focus:ring-red-100" : "pr-10"} value={password} onChange={(event) => { setPassword(event.target.value); setError(""); }} autoComplete="current-password" readOnly={busy} aria-invalid={Boolean(error)} placeholder="The password you sign in with" />
          <button type="button" className="absolute right-1 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700" title={visible ? "Hide password" : "Show password"} onClick={() => setVisible((v) => !v)}>
            {visible ? <EyeSlash size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </label>
      {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700" role="alert">{error}</p>}

      <Button className="mt-6 h-11 w-full" variant="destructive" disabled={busy || !password}>
        {busy ? <><span className="size-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Deleting…</> : "Delete account"}
      </Button>

      <footer className="mt-8 flex items-center justify-between gap-4 border-t border-neutral-100 pt-5 text-xs text-neutral-400">
        <span className="flex items-center gap-1.5"><Warning size={14} weight="duotone" className="text-red-500" /> Your data can't be recovered</span>
        <button type="button" className="-mr-2 rounded-md px-2 py-1 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-950 disabled:opacity-50" disabled={busy} onClick={close}>Cancel</button>
      </footer>
    </form>
  }</Dialog>;
}
