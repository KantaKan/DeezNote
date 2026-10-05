import { LockKey } from "@phosphor-icons/react";
import { useState, type FormEvent } from "react";
import { api } from "../lib/api";
import { linkProps, navigate } from "../lib/router";
import { Logo } from "./Logo";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export function AuthScreen({ mode, onAuthenticated }: { mode: "login" | "register"; onAuthenticated: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.authenticate(mode, email, password);
      onAuthenticated();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not authenticate");
    } finally {
      setBusy(false);
    }
  }

  return <main className="grid min-h-screen grid-cols-1 bg-white lg:grid-cols-[1.05fr_.95fr]">
    <section className="hidden overflow-hidden bg-neutral-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
      <a {...linkProps("/")} className="flex w-fit items-center gap-3 text-sm font-semibold"><Logo className="size-9 rounded-[22.6%] ring-1 ring-white/15" /> DeezNote</a>
      <div className="max-w-xl pb-12">
        <p className="mb-5 text-sm font-medium text-amber-300">Private notes, without compromise.</p>
        <h1 className="text-5xl font-semibold leading-[1.08] tracking-[-0.04em]">Write freely.<br />Only you can read it.</h1>
        <p className="mt-6 max-w-md text-base leading-7 text-neutral-400">Every note is encrypted on your device before it is synced. Your vault passphrase never reaches our server.</p>
      </div>
      <p className="flex items-center gap-2 text-xs text-neutral-500"><LockKey size={15} weight="duotone" /> End-to-end encrypted</p>
    </section>

    <section className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <a {...linkProps("/")} className="mb-10 flex w-fit items-center gap-3 font-semibold lg:hidden"><Logo className="size-9" /> DeezNote</a>
        <p className="mb-2 text-sm font-medium text-amber-600">{mode === "login" ? "Welcome back" : "Get started"}</p>
        <h2 className="text-3xl font-semibold tracking-[-0.03em] text-neutral-950">{mode === "login" ? "Sign in to your notes" : "Create your account"}</h2>
        <p className="mt-3 text-sm leading-6 text-neutral-500">{mode === "login" ? "Enter your details to unlock your workspace." : "Your account password and vault passphrase will be separate."}</p>

        <form className="mt-8 grid gap-5" onSubmit={submit}>
          <label className="grid gap-2 text-sm font-medium text-neutral-700">Email<Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" placeholder="you@example.com" /></label>
          <label className="grid gap-2 text-sm font-medium text-neutral-700">Password<Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={10} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="At least 10 characters" /></label>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</p>}
          <Button className="mt-1 h-11" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}</Button>
          {mode === "register" && <p className="text-xs leading-5 text-neutral-500">By creating an account you agree to the <a {...linkProps("/terms")} className="font-medium text-neutral-700 underline underline-offset-2 hover:text-neutral-950">Terms</a> and <a {...linkProps("/privacy")} className="font-medium text-neutral-700 underline underline-offset-2 hover:text-neutral-950">Privacy Policy</a>.</p>}
        </form>
        <button className="mt-6 w-full text-center text-sm text-neutral-500 hover:text-neutral-950" onClick={() => { setError(""); navigate(mode === "login" ? "/signup" : "/login", { replace: true }); }}>
          {mode === "login" ? "New here? Create an account" : "Already have an account? Sign in"}
        </button>
      </div>
    </section>
  </main>;
}
