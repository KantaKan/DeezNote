import { Check as CheckIcon, Eye, EyeSlash, LockSimple, ShieldCheck, Warning } from "@phosphor-icons/react";
import { forwardRef, useRef, useState, type FormEvent, type ReactNode, type Ref } from "react";
import { Button } from "./ui/button";
import { Dialog, DialogHeader } from "./ui/dialog";
import { Input } from "./ui/input";

const MIN_LENGTH = 10;

/** Returns an error message to show, or null when the action succeeded. */
type Submit = (password: string) => Promise<string | null>;

function PasswordField({ value, onChange, visible, onToggle, ...props }: {
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  onToggle: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  autoComplete?: string;
  disabled?: boolean;
  readOnly?: boolean;
  invalid?: boolean;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const { inputRef, invalid, ...rest } = props;
  return <div className="relative">
    <Input ref={inputRef} type={visible ? "text" : "password"} className={invalid ? "pr-10 border-red-300 focus:border-red-400 focus:ring-red-100" : "pr-10"} aria-invalid={invalid} value={value} onChange={(event) => onChange(event.target.value)} autoComplete="new-password" spellCheck={false} {...rest} />
    <button type="button" className="absolute right-1 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700" title={visible ? "Hide password" : "Show password"} onClick={onToggle}>
      {visible ? <EyeSlash size={16} /> : <Eye size={16} />}
    </button>
  </div>;
}

export function ProtectNoteDialog({ noteTitle, onSubmit, onClose }: { noteTitle: string; onSubmit: Submit; onClose: () => void }) {
  const passwordRef = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const longEnough = password.length >= MIN_LENGTH;
  const matches = confirmation.length > 0 && confirmation === password;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!longEnough) return setError(`Use at least ${MIN_LENGTH} characters.`);
    if (!matches) return setError("The passwords do not match.");
    setBusy(true);
    setError("");
    const failure = await onSubmit(password);
    setBusy(false);
    if (failure) setError(failure);
    else onClose();
  }

  return <Dialog busy={busy} initialFocus={passwordRef} onClose={onClose}>{(close) =>
    <form className="p-8 sm:p-10" onSubmit={submit}>
      <DialogHeader busy={busy} onClose={close} />
      <h2 className="truncate text-2xl font-semibold tracking-[-0.03em] text-neutral-950">Lock “{noteTitle || "Untitled"}”</h2>
      <p className="mt-2.5 text-sm leading-6 text-neutral-500">This note will need its own password to open, on top of your vault passphrase.</p>

      <div className="mt-7 grid gap-5">
        <label className="grid gap-2 text-sm font-medium text-neutral-700">
          <span className="flex items-center justify-between">Note password<Check ok={longEnough}>{MIN_LENGTH}+ characters</Check></span>
          <PasswordField value={password} onChange={(value) => { setPassword(value); setError(""); }} visible={visible} onToggle={() => setVisible((v) => !v)} inputRef={passwordRef} placeholder={`At least ${MIN_LENGTH} characters`} readOnly={busy} />
        </label>
        <label className="grid gap-2 text-sm font-medium text-neutral-700">
          <span className="flex items-center justify-between">Confirm password<Check ok={matches}>Match</Check></span>
          <PasswordField value={confirmation} onChange={(value) => { setConfirmation(value); setError(""); }} visible={visible} onToggle={() => setVisible((v) => !v)} placeholder="Type it again" invalid={confirmation.length >= password.length && confirmation.length > 0 && !matches} readOnly={busy} />
        </label>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700" role="alert">{error}</p>}
        <Button className="mt-1 h-11" disabled={busy || !longEnough || !matches}>
          {busy ? <><span className="size-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Encrypting…</> : "Lock note"}
        </Button>
      </div>

      <footer className="mt-8 flex items-center justify-between gap-4 border-t border-neutral-100 pt-5 text-xs text-neutral-400">
        <span className="flex items-center gap-1.5"><Warning size={14} weight="duotone" className="text-amber-500" /> Can't be recovered if forgotten</span>
        <button type="button" className="-mr-2 rounded-md px-2 py-1 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-950 disabled:opacity-50" disabled={busy} onClick={close}>Cancel</button>
      </footer>
    </form>
  }</Dialog>;
}

function Check({ ok, children }: { ok: boolean; children: ReactNode }) {
  return <span className={`flex items-center gap-1 text-xs font-normal transition-colors ${ok ? "text-emerald-600" : "text-neutral-400"}`}>
    {ok && <CheckIcon size={12} weight="bold" />}{children}
  </span>;
}

// Placeholder line widths for the hidden note body (deterministic so it doesn't jump between renders).
const REDACTED_LINES = ["92%", "78%", "86%", "40%", "", "95%", "70%", "88%", "54%", "", "82%", "66%", "90%", "48%", "", "84%", "72%", "60%"];

export const UnlockNoteCard = forwardRef<HTMLInputElement, { updatedAt?: string; onSubmit: Submit }>(function UnlockNoteCard({ updatedAt, onSubmit }, ref) {
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError("");
    const failure = await onSubmit(password);
    setBusy(false);
    if (failure) {
      setError(failure);
      setPassword("");
      setAttempt((count) => count + 1);
    }
  }

  return <div className="relative mt-8 pb-28">
    <div aria-hidden="true" className="absolute inset-x-0 top-0 grid select-none gap-3.5 pt-2 [mask-image:linear-gradient(to_bottom,black,transparent_90%)]">
      {REDACTED_LINES.map((width, index) => width
        ? <span key={index} className="h-3 rounded-full bg-neutral-100" style={{ width }} />
        : <span key={index} className="h-2" />)}
    </div>

    <form className="relative mx-auto mt-8 w-full max-w-md rounded-3xl border border-neutral-200 bg-white/95 p-8 shadow-[0_24px_80px_-32px_rgba(0,0,0,.22)] backdrop-blur-md sm:p-10" onSubmit={submit}>
      <header className="mb-8 flex items-center justify-between gap-4">
        <span className="flex items-center gap-2 text-[0.9375rem] font-semibold tracking-[-.01em]"><LockSimple size={16} weight="fill" className="text-amber-500" /> Locked note</span>
        {updatedAt && <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-500">Edited {new Date(updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>}
      </header>
      <h2 className="text-2xl font-semibold tracking-[-0.03em] text-neutral-950">Unlock this note</h2>
      <p className="mt-2.5 text-sm leading-6 text-neutral-500">Enter this note's password to read and edit it. Your vault passphrase can't open it.</p>

      <div className="mt-7 grid gap-5">
        <label className="grid gap-2 text-sm font-medium text-neutral-700">
          Note password
          <div key={attempt} className={error ? "animate-shake" : undefined}>
            <PasswordField
              inputRef={ref}
              value={password}
              onChange={(value) => { setPassword(value); setError(""); }}
              visible={visible}
              onToggle={() => setVisible((v) => !v)}
              placeholder="Enter the note password"
              autoComplete="current-password"
              invalid={Boolean(error)}
              readOnly={busy}
              autoFocus
            />
          </div>
        </label>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700" role="alert">{error}</p>}
        <Button className="mt-1 h-11" disabled={busy || !password}>
          {busy ? <><span className="size-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Decrypting…</> : "Unlock note"}
        </Button>
      </div>

      <footer className="mt-8 flex items-center justify-between gap-4 border-t border-neutral-100 pt-5 text-xs text-neutral-400">
        <span className="flex items-center gap-1.5"><ShieldCheck size={14} weight="duotone" /> Extra encryption layer</span>
        <span>Can't be recovered if forgotten</span>
      </footer>
    </form>
  </div>;
});
