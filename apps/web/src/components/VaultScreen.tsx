import { ShieldCheck, SignOut } from "@phosphor-icons/react";
import type { EncryptedVault } from "@save-text/shared";
import { useState, type FormEvent } from "react";
import { api } from "../lib/api";
import { createVault, unlockVault } from "../lib/crypto";
import { Logo } from "./Logo";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

interface Props {
  envelope: EncryptedVault | null;
  onUnlocked: (key: Uint8Array) => void;
  onLogout: () => void;
}

export function VaultScreen({ envelope, onUnlocked, onLogout }: Props) {
  const [passphrase, setPassphrase] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const creating = !envelope;
  const email = localStorage.getItem("save-text-email");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (creating && passphrase !== confirmation) return setError("Passphrases do not match");
    if (creating && passphrase.length < 12) return setError("Use at least 12 characters");
    setBusy(true);
    setError("");
    try {
      if (creating) {
        const result = await createVault(passphrase);
        await api.createVault(result.envelope);
        onUnlocked(result.vaultKey);
      } else {
        onUnlocked(await unlockVault(envelope, passphrase));
      }
    } catch {
      setError(creating ? "Could not create the vault" : "Wrong passphrase or damaged vault");
    } finally {
      setBusy(false);
    }
  }

  return <main className="grid min-h-screen place-items-center bg-neutral-50 px-6 py-12">
    <section className="w-full max-w-md rounded-3xl border border-neutral-200 bg-white p-8 shadow-[0_24px_80px_-32px_rgba(0,0,0,.22)] sm:p-10">
      <header className="mb-10 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 text-[0.9375rem] font-semibold tracking-[-.01em]"><Logo className="size-7" /> DeezNote</div>
        {email && <span className="min-w-0 truncate rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-500" title={email}>{email}</span>}
      </header>
      <h1 className="text-3xl font-semibold tracking-[-0.035em] text-neutral-950">{creating ? "Create your vault" : "Unlock your vault"}</h1>
      <p className="mt-3 text-sm leading-6 text-neutral-500">This passphrase stays on your device. If you lose it, your encrypted notes cannot be recovered.</p>
      <form className="mt-8 grid gap-5" onSubmit={submit}>
        <label className="grid gap-2 text-sm font-medium text-neutral-700">Vault passphrase<Input type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} required autoFocus autoComplete="off" placeholder={creating ? "At least 12 characters" : "Enter your vault passphrase"} /></label>
        {creating && <label className="grid gap-2 text-sm font-medium text-neutral-700">Confirm passphrase<Input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required autoComplete="off" /></label>}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</p>}
        <Button className="mt-1 h-11" disabled={busy}>{busy ? "Working…" : creating ? "Create encrypted vault" : "Unlock vault"}</Button>
      </form>
      <footer className="mt-8 flex items-center justify-between border-t border-neutral-100 pt-5 text-xs text-neutral-400">
        <span className="flex items-center gap-1.5"><ShieldCheck size={14} weight="duotone" /> Argon2id + XChaCha20</span>
        <button className="flex items-center gap-1.5 rounded-md px-2 py-1 -mr-2 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-950" onClick={onLogout}><SignOut size={14} /> Sign out</button>
      </footer>
    </section>
  </main>;
}
