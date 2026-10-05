import { ArrowLeft, ArrowRight, Check, Eye, EyeSlash, Key, LockKey, ShieldCheck, SignOut, UserCircle } from "@phosphor-icons/react";
import type { EncryptedVault } from "@save-text/shared";
import { useState, type FormEvent, type ReactNode } from "react";
import { api } from "../lib/api";
import { createVault, unlockVault } from "../lib/crypto";
import { Logo } from "./Logo";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

interface Props {
  envelope: EncryptedVault | null;
  /** `created` carries the new envelope so the app knows the vault exists from now on. */
  onUnlocked: (key: Uint8Array, created?: EncryptedVault) => void;
  onLogout: () => void;
}

const MIN_LENGTH = 12;

/** A rough guide, not a guarantee: rewards length and several random words over symbol soup. */
function passphraseStrength(value: string) {
  if (value.length < MIN_LENGTH) return { score: 0, label: `At least ${MIN_LENGTH} characters` };
  const words = value.trim().split(/[\s\-_.]+/).filter((word) => word.length >= 3).length;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z\d\s]/].filter((pattern) => pattern.test(value)).length;
  let score = value.length >= 24 ? 3 : value.length >= 18 ? 2 : 1;
  if (words >= 4 || classes >= 3) score += 1;
  if (/^(.)\1+$/.test(value) || /^(?:0123|1234|abcd|qwer|pass)/i.test(value)) score = 1;
  return { score: Math.min(score, 4), label: ["", "Weak", "Fair", "Good", "Strong"][Math.min(score, 4)] };
}

function Card({ email, onLogout, children }: { email: string | null; onLogout: () => void; children: ReactNode }) {
  return <main className="grid min-h-screen place-items-center bg-neutral-50 px-6 py-12">
    <section className="w-full max-w-md rounded-3xl border border-neutral-200 bg-white p-8 shadow-[0_24px_80px_-32px_rgba(0,0,0,.22)] sm:p-10">
      <header className="mb-10 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 text-[0.9375rem] font-semibold tracking-[-.01em]"><Logo className="size-7" /> DeezNote</div>
        {email && <span className="min-w-0 truncate rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-500" title={email}>{email}</span>}
      </header>
      {children}
      <footer className="mt-8 flex items-center justify-between border-t border-neutral-100 pt-5 text-xs text-neutral-400">
        <span className="flex items-center gap-1.5"><ShieldCheck size={14} weight="duotone" /> Argon2id + XChaCha20</span>
        <button className="-mr-2 flex items-center gap-1.5 rounded-md px-2 py-1 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-950" onClick={onLogout}><SignOut size={14} /> Sign out</button>
      </footer>
    </section>
  </main>;
}

function PassphraseInput({ value, onChange, visible, onToggle, ...props }: { value: string; onChange: (value: string) => void; visible: boolean; onToggle: () => void; placeholder?: string; autoFocus?: boolean; readOnly?: boolean }) {
  return <div className="relative">
    <Input type={visible ? "text" : "password"} className="pr-10" value={value} onChange={(event) => onChange(event.target.value)} autoComplete="new-password" spellCheck={false} {...props} />
    <button type="button" className="absolute right-1 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700" title={visible ? "Hide passphrase" : "Show passphrase"} onClick={onToggle}>
      {visible ? <EyeSlash size={16} /> : <Eye size={16} />}
    </button>
  </div>;
}

function Steps({ current }: { current: number }) {
  return <div className="mb-6 flex items-center gap-2" aria-label={`Step ${current} of 3`}>
    {[1, 2, 3].map((step) => <span key={step} className={`h-1 flex-1 rounded-full transition-colors ${step <= current ? "bg-amber-500" : "bg-neutral-200"}`} />)}
  </div>;
}

function CreateVault({ onCreated }: { onCreated: (key: Uint8Array, envelope: EncryptedVault) => void }) {
  const [step, setStep] = useState(1);
  const [passphrase, setPassphrase] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState(false);
  const [saved, setSaved] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const strength = passphraseStrength(passphrase);
  const matches = confirmation.length > 0 && confirmation === passphrase;

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!saved || !understood || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await createVault(passphrase);
      await api.createVault(result.envelope);
      onCreated(result.vaultKey, result.envelope);
    } catch {
      setBusy(false);
      setError("Could not create your vault. Check your connection and try again.");
    }
  }

  if (step === 1) return <>
    <Steps current={1} />
    <h1 className="text-3xl font-semibold tracking-[-0.035em] text-neutral-950">One more secret</h1>
    <p className="mt-3 text-sm leading-6 text-neutral-500">DeezNote uses two, and they do different jobs.</p>
    <div className="mt-7 grid gap-5">
      <div className="flex gap-3.5">
        <UserCircle size={22} weight="duotone" className="mt-0.5 shrink-0 text-neutral-500" />
        <p className="text-sm leading-6 text-neutral-600"><span className="font-semibold text-neutral-900">Account password.</span> Signs you in. You already made this one.</p>
      </div>
      <div className="flex gap-3.5">
        <Key size={22} weight="duotone" className="mt-0.5 shrink-0 text-amber-600" />
        <p className="text-sm leading-6 text-neutral-600"><span className="font-semibold text-neutral-900">Vault passphrase.</span> Encrypts your notes on this device. It never leaves it, so if you lose it, nobody can recover your notes. Not even us.</p>
      </div>
    </div>
    <Button className="mt-8 h-11 w-full" type="button" onClick={() => setStep(2)}>Create my passphrase <ArrowRight size={16} weight="bold" /></Button>
  </>;

  if (step === 2) return <form onSubmit={(event) => { event.preventDefault(); if (strength.score > 0 && matches) setStep(3); }}>
    <Steps current={2} />
    <h1 className="text-3xl font-semibold tracking-[-0.035em] text-neutral-950">Create your passphrase</h1>
    <p className="mt-3 text-sm leading-6 text-neutral-500">Four or more random words are easy to remember and hard to guess, like <span className="font-medium text-neutral-700">"copper lantern river moss"</span>.</p>
    <div className="mt-7 grid gap-5">
      <label className="grid gap-2 text-sm font-medium text-neutral-700">
        <span className="flex items-center justify-between">Vault passphrase<span className={`text-xs font-normal ${strength.score >= 3 ? "text-emerald-600" : strength.score === 2 ? "text-amber-600" : "text-neutral-400"}`}>{strength.label}</span></span>
        <PassphraseInput value={passphrase} onChange={setPassphrase} visible={visible} onToggle={() => setVisible((v) => !v)} placeholder={`At least ${MIN_LENGTH} characters`} autoFocus />
        <span className="grid grid-cols-4 gap-1.5" aria-hidden="true">
          {[1, 2, 3, 4].map((bar) => <span key={bar} className={`h-1 rounded-full transition-colors ${bar <= strength.score ? strength.score >= 3 ? "bg-emerald-500" : strength.score === 2 ? "bg-amber-500" : "bg-red-400" : "bg-neutral-200"}`} />)}
        </span>
      </label>
      <label className="grid gap-2 text-sm font-medium text-neutral-700">
        <span className="flex items-center justify-between">Type it again<span className={`flex items-center gap-1 text-xs font-normal ${matches ? "text-emerald-600" : "text-neutral-400"}`}>{matches && <Check size={12} weight="bold" />}Match</span></span>
        <PassphraseInput value={confirmation} onChange={setConfirmation} visible={visible} onToggle={() => setVisible((v) => !v)} />
      </label>
    </div>
    <div className="mt-8 flex gap-3">
      <Button type="button" variant="outline" className="h-11" onClick={() => setStep(1)}><ArrowLeft size={16} /> Back</Button>
      <Button className="h-11 flex-1" disabled={strength.score === 0 || !matches}>Continue <ArrowRight size={16} weight="bold" /></Button>
    </div>
  </form>;

  return <form onSubmit={create}>
    <Steps current={3} />
    <h1 className="text-3xl font-semibold tracking-[-0.035em] text-neutral-950">Save it somewhere safe</h1>
    <p className="mt-3 text-sm leading-6 text-neutral-500">A password manager is best. Paper in a drawer works too. You'll need it each time you open DeezNote on a new device.</p>
    <div className="mt-7 grid gap-3">
      {[
        { checked: saved, set: setSaved, text: "I've saved my vault passphrase." },
        { checked: understood, set: setUnderstood, text: "I understand nobody can recover it, and losing it means losing my notes." },
      ].map(({ checked, set, text }) => <label key={text} className={`flex cursor-pointer gap-3 rounded-xl border px-4 py-3.5 text-sm leading-6 transition-colors ${checked ? "border-amber-300 bg-amber-50 text-neutral-900 dark:border-amber-300/50 dark:bg-amber-50/40" : "border-neutral-200 text-neutral-600 hover:bg-neutral-50"}`}>
        <input type="checkbox" className="mt-1 size-4 shrink-0 accent-amber-600" checked={checked} disabled={busy} onChange={(event) => set(event.target.checked)} />
        {text}
      </label>)}
    </div>
    {error && <p className="mt-5 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700" role="alert">{error}</p>}
    <div className="mt-8 flex gap-3">
      <Button type="button" variant="outline" className="h-11" disabled={busy} onClick={() => setStep(2)}><ArrowLeft size={16} /> Back</Button>
      <Button className="h-11 flex-1" disabled={!saved || !understood || busy}>
        {busy ? <><span className="size-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Creating your vault…</> : <><LockKey size={16} weight="bold" /> Create my vault</>}
      </Button>
    </div>
  </form>;
}

export function VaultScreen({ envelope, onUnlocked, onLogout }: Props) {
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const email = localStorage.getItem("save-text-email");

  if (!envelope) {
    return <Card email={email} onLogout={onLogout}><CreateVault onCreated={(key, created) => onUnlocked(key, created)} /></Card>;
  }

  async function unlock(event: FormEvent) {
    event.preventDefault();
    if (!envelope) return;
    setBusy(true);
    setError("");
    try {
      onUnlocked(await unlockVault(envelope, passphrase));
    } catch {
      setError("Wrong passphrase or damaged vault");
    } finally {
      setBusy(false);
    }
  }

  return <Card email={email} onLogout={onLogout}>
    <h1 className="text-3xl font-semibold tracking-[-0.035em] text-neutral-950">Unlock your vault</h1>
    <p className="mt-3 text-sm leading-6 text-neutral-500">This passphrase stays on your device. If you lose it, your encrypted notes cannot be recovered.</p>
    <form className="mt-8 grid gap-5" onSubmit={unlock}>
      <label className="grid gap-2 text-sm font-medium text-neutral-700">Vault passphrase<Input type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} required autoFocus autoComplete="off" placeholder="Enter your vault passphrase" /></label>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</p>}
      <Button className="mt-1 h-11" disabled={busy}>{busy ? "Working…" : "Unlock vault"}</Button>
    </form>
  </Card>;
}
