import { ArrowLeft } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { INTROS, PrivacyEn, PrivacyTh, TermsEn, TermsTh, TITLES, type Lang, type LegalKind } from "../legal/content";
import { LAST_UPDATED } from "../legal/policy";
import { linkProps } from "../lib/router";
import { Logo } from "./Logo";

const LANG_KEY = "deeznote-legal-lang";

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === "en" || saved === "th") return saved;
  } catch {
    // Storage can be unavailable; fall back to the browser language.
  }
  return navigator.language.toLowerCase().startsWith("th") ? "th" : "en";
}

function formatDate(lang: Lang) {
  return new Date(`${LAST_UPDATED}T00:00:00`).toLocaleDateString(lang === "th" ? "th-TH" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export function LegalPage({ kind, signedIn }: { kind: LegalKind; signedIn: boolean }) {
  const [lang, setLang] = useState<Lang>(initialLang);
  const Content = kind === "privacy" ? (lang === "th" ? PrivacyTh : PrivacyEn) : (lang === "th" ? TermsTh : TermsEn);

  useEffect(() => {
    document.title = `${TITLES[kind][lang]} | DeezNote`;
    document.documentElement.lang = lang;
    return () => {
      document.title = "DeezNote";
      document.documentElement.lang = "en";
    };
  }, [kind, lang]);

  function chooseLang(next: Lang) {
    setLang(next);
    try { localStorage.setItem(LANG_KEY, next); } catch { /* not persisting is fine */ }
  }

  return <div className="min-h-[100dvh] bg-white text-neutral-950">
    <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
      <a {...linkProps("/")} className="flex items-center gap-2.5 text-[0.9375rem] font-semibold tracking-[-.01em]"><Logo /> DeezNote</a>
      {signedIn
        ? <a {...linkProps("/")} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 hover:text-neutral-950"><ArrowLeft size={15} /> {lang === "th" ? "กลับไปที่โน้ต" : "Back to notes"}</a>
        : <a {...linkProps("/login")} className="rounded-lg px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 hover:text-neutral-950">Sign in</a>}
    </header>

    <main className="mx-auto max-w-[44rem] px-5 pb-24 pt-10 sm:px-8 sm:pt-16">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-4xl font-bold tracking-[-.04em] sm:text-5xl">{TITLES[kind][lang]}</h1>
        <div className="flex rounded-lg bg-neutral-100 p-0.5 text-sm" role="group" aria-label="Language">
          {(["th", "en"] as const).map((option) => <button key={option} type="button" aria-pressed={lang === option} className={`rounded-md px-3 py-1.5 font-medium transition ${lang === option ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-800"}`} onClick={() => chooseLang(option)}>{option === "th" ? "ไทย" : "English"}</button>)}
        </div>
      </div>
      <p className="mt-4 text-sm text-neutral-500">{lang === "th" ? "ปรับปรุงล่าสุด" : "Last updated"} {formatDate(lang)}</p>
      <p className="mt-8 text-lg leading-relaxed text-neutral-700">{INTROS[kind][lang]}</p>
      <Content />
    </main>

    <footer className="border-t border-neutral-200">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 text-sm text-neutral-500 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <span className="flex items-center gap-2.5 font-medium text-neutral-700"><Logo className="size-6" /> DeezNote</span>
        <div className="flex items-center gap-5">
          <a {...linkProps(kind === "privacy" ? "/terms" : "/privacy")} className="transition hover:text-neutral-900">{TITLES[kind === "privacy" ? "terms" : "privacy"][lang]}</a>
        </div>
      </div>
    </footer>
  </div>;
}
