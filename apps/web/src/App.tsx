import type { EncryptedVault } from "@save-text/shared";
import { useCallback, useEffect, useState } from "react";
import { AuthScreen } from "./components/AuthScreen";
import { Landing } from "./components/Landing";
import { LegalPage } from "./components/LegalPage";
import { NotesWorkspace } from "./components/NotesWorkspace";
import { VaultScreen } from "./components/VaultScreen";
import { api } from "./lib/api";
import { destroyKey } from "./lib/crypto";
import { localDb } from "./lib/db";
import { navigate, usePathname } from "./lib/router";

export function App() {
  const [authenticated, setAuthenticated] = useState(Boolean(localStorage.getItem("save-text-token")));
  const [envelope, setEnvelope] = useState<EncryptedVault | null | undefined>(undefined);
  const [vaultKey, setVaultKey] = useState<Uint8Array | null>(null);
  // True only right after this browser created the vault: the workspace seeds a welcome note once.
  const [firstRun, setFirstRun] = useState(false);
  const pathname = usePathname();

  const legalPage = pathname === "/privacy" ? "privacy" : pathname === "/terms" ? "terms" : null;

  // Signed-in users skip the landing and sign-in pages (the app lives at "/"); legal pages stay open to everyone.
  useEffect(() => {
    if (authenticated && pathname !== "/" && !legalPage) navigate("/", { replace: true });
  }, [authenticated, pathname, legalPage]);

  const fetchVault = useCallback(async () => {
    try {
      const result = await api.getVault();
      setEnvelope(result.vault);
      setAuthenticated(true);
    } catch {
      localStorage.removeItem("save-text-token");
      localStorage.removeItem("save-text-email");
      await localDb.notes.clear();
      setAuthenticated(false);
      setEnvelope(undefined);
    }
  }, []);

  useEffect(() => {
    if (authenticated) void fetchVault();
  }, [authenticated, fetchVault]);

  useEffect(() => {
    if (!vaultKey) return;
    const timeoutMs = 15 * 60 * 1000;
    let lastActivity = Date.now();
    let timer: number;

    const autoLock = () => {
      if (Date.now() - lastActivity < timeoutMs) {
        timer = window.setTimeout(autoLock, timeoutMs - (Date.now() - lastActivity));
        return;
      }
      void destroyKey(vaultKey);
      setVaultKey(null);
    };
    const recordActivity = () => {
      lastActivity = Date.now();
      window.clearTimeout(timer);
      timer = window.setTimeout(autoLock, timeoutMs);
    };
    const checkWhenVisible = () => {
      if (document.visibilityState === "visible") autoLock();
    };

    const events: Array<keyof WindowEventMap> = ["keydown", "pointerdown", "touchstart"];
    events.forEach((event) => window.addEventListener(event, recordActivity, { passive: true }));
    document.addEventListener("visibilitychange", checkWhenVisible);
    timer = window.setTimeout(autoLock, timeoutMs);

    return () => {
      window.clearTimeout(timer);
      events.forEach((event) => window.removeEventListener(event, recordActivity));
      document.removeEventListener("visibilitychange", checkWhenVisible);
    };
  }, [vaultKey]);

  async function lock() {
    await destroyKey(vaultKey);
    setVaultKey(null);
  }

  async function logout() {
    try {
      await api.logout();
    } catch {
      // Local logout must still work if the API is unavailable.
    }
    await lock();
    await localDb.notes.clear();
    localStorage.removeItem("save-text-token");
    localStorage.removeItem("save-text-email");
    setEnvelope(undefined);
    setAuthenticated(false);
  }

  if (legalPage) return <LegalPage kind={legalPage} signedIn={authenticated} />;
  if (!authenticated) {
    if (pathname === "/login" || pathname === "/signup") {
      return <AuthScreen mode={pathname === "/signup" ? "register" : "login"} onAuthenticated={() => setAuthenticated(true)} />;
    }
    return <Landing />;
  }
  if (envelope === undefined) return <main className="grid min-h-screen place-items-center bg-neutral-50"><div className="grid justify-items-center gap-3"><span className="size-6 animate-spin rounded-full border-2 border-neutral-200 border-t-amber-500" /><p className="text-sm text-neutral-500">Opening DeezNote…</p></div></main>;
  if (!vaultKey) {
    return <VaultScreen
      envelope={envelope}
      onUnlocked={(key, created) => {
        // Remember a just-created vault, so a later auto-lock shows "Unlock" instead of "Create" again.
        if (created) {
          setEnvelope(created);
          setFirstRun(true);
        }
        setVaultKey(key);
      }}
      onLogout={() => void logout()}
    />;
  }
  return <NotesWorkspace vaultKey={vaultKey} firstRun={firstRun} onLock={() => void lock()} onLogout={() => void logout()} />;
}
