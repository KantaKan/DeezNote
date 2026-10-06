import { ArrowDown, ArrowRight, Check, Code, Crown, Key, List, MarkdownLogo, Star, WifiSlash } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { REPO_URL } from "../legal/policy";
import { linkProps } from "../lib/router";
import { Logo } from "./Logo";
import { NoteCard, NoteSectionLabel } from "./NoteCard";
import { NoteColorSwatches } from "./NoteColorPicker";

// Public front door. Light and dark come from the same palette tokens as the app (styles.css),
// so every class here works in both themes. Shape system: buttons rounded-lg, panels and images rounded-2xl.

// Real output of encryptNote() for the "Skye, late September" note shown on the left (values truncated).
const STORED_ROW = [
  ["id", "6f1c2a9e-4b7d-4e0a-9c55-2d8e1f3b7a60"],
  ["encryptedContent", "A0xQjkJxDhiIE9wDBkKwR7HyJ0zl64z1W3OwHZLdCmwGCv0qKDkX85RhJyCE2oxjjMGnhVJGZ6i/VNnhVCIx7hk7sAgIhvqt0/0mUunPGSY6…"],
  ["contentNonce", "Wvave2q301S13JnWAsevHF3sEf5XkU3L"],
  ["encryptedNoteKey", "bCczmbcpLDK3kkc9LiSJZgUf2XOhka3kiP89zlJbUI5a…"],
  ["keyNonce", "SyeFrHP4KtbREG8tqSxb39cFgkis2rO8"],
  ["version", "1"],
] as const;

const primaryButton = "inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-neutral-900 px-5 text-sm font-medium text-white transition hover:bg-neutral-800 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60";
const secondaryButton = "inline-flex h-11 items-center justify-center whitespace-nowrap rounded-lg border border-neutral-300 px-5 text-sm font-medium text-neutral-800 transition hover:bg-neutral-100 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60";
const panelShadow = "shadow-[0_28px_70px_-36px_rgb(17_17_15/0.45)]";

/** A screenshot with separate light and dark captures; the page theme picks which one shows. */
function Shot({ name, alt, width, height, className = "", eager = false }: { name: string; alt: string; width: number; height: number; className?: string; eager?: boolean }) {
  const common = { width, height, decoding: "async" as const, loading: eager ? "eager" as const : "lazy" as const, ...(eager && { fetchPriority: "high" as const }) };
  return <>
    <img {...common} src={`/landing/${name}-light.webp`} alt={alt} className={`${className} dark:hidden`} />
    <img {...common} src={`/landing/${name}-dark.webp`} alt="" aria-hidden="true" className={`${className} hidden dark:block`} />
  </>;
}

/** Fades sections in as they scroll into view. Skipped entirely under reduced motion (see styles.css). */
function useReveal() {
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const targets = rootRef.current?.querySelectorAll<HTMLElement>("[data-reveal]");
    if (!targets?.length) return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.setAttribute("data-shown", "");
        observer.unobserve(entry.target);
      }
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0.15 });
    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, []);
  return rootRef;
}

// Pro pricing. Thai visitors see baht; everyone else sees US dollars.
const PRICES = {
  thb: { monthly: "฿79", yearly: "฿490", yearlyAsMonthly: "฿41", save: "48%" },
  usd: { monthly: "$2.99", yearly: "$17.99", yearlyAsMonthly: "$1.50", save: "50%" },
} as const;

function localPrices() {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return zone === "Asia/Bangkok" || navigator.language.toLowerCase().startsWith("th") ? PRICES.thb : PRICES.usd;
}

function Feature({ children, inverted = false }: { children: ReactNode; inverted?: boolean }) {
  return <li className="flex gap-2.5"><Check size={16} weight="bold" className={`mt-1 shrink-0 ${inverted ? "text-amber-400" : "text-amber-600"}`} />{children}</li>;
}

function Pricing() {
  const [yearly, setYearly] = useState(true);
  const prices = localPrices();

  return <section id="pricing" className="mx-auto max-w-6xl scroll-mt-20 px-5 pb-20 sm:px-8 lg:pb-28">
    <div data-reveal className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
      <div>
        <h2 className="text-balance text-3xl font-bold tracking-[-.035em] sm:text-4xl">Free to start. Pro when you need room.</h2>
        <p className="mt-4 max-w-[52ch] text-lg leading-relaxed text-neutral-600">Both plans get the same encryption. Pro adds space for photos.</p>
      </div>
      <div className="flex rounded-lg bg-neutral-100 p-1 text-sm" role="radiogroup" aria-label="Billing period">
        {[{ value: true, label: "Yearly" }, { value: false, label: "Monthly" }].map(({ value, label }) => <button
          key={label}
          type="button"
          role="radio"
          aria-checked={yearly === value}
          className={`flex items-center gap-2 rounded-md px-3.5 py-1.5 font-medium transition ${yearly === value ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-800"}`}
          onClick={() => setYearly(value)}
        >{label}{value && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[0.6875rem] font-semibold text-amber-800">Save {prices.save}</span>}</button>)}
      </div>
    </div>

    <div className="mt-12 grid gap-4 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <article data-reveal className="flex flex-col rounded-2xl bg-neutral-50 p-7 ring-1 ring-neutral-900/[.07] sm:p-8">
        <h3 className="text-lg font-semibold tracking-tight">Free</h3>
        <p className="mt-4 flex items-baseline gap-1.5"><span className="text-4xl font-bold tracking-[-.04em]">{prices === PRICES.thb ? "฿0" : "$0"}</span><span className="text-neutral-500">forever</span></p>
        <ul className="mt-7 grid gap-3 text-[0.9375rem] text-neutral-700">
          <Feature>End-to-end encryption on every note</Feature>
          <Feature>Works offline, syncs across your devices</Feature>
          <Feature>Note passwords, colours and favourites</Feature>
          <Feature>256 KB per note, 25 MB in total</Feature>
        </ul>
        <a {...linkProps("/signup")} className={`${secondaryButton} mt-8 self-start`}>Create account</a>
      </article>

      <article data-reveal className={`flex flex-col rounded-2xl bg-neutral-900 p-7 text-neutral-50 sm:p-8 ${panelShadow}`}>
        <div className="flex items-center justify-between gap-4">
          <h3 className="flex items-center gap-2 text-lg font-semibold tracking-tight"><Crown size={18} weight="duotone" className="text-amber-400" /> Pro</h3>
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-neutral-300">Coming soon</span>
        </div>
        <p className="mt-4 flex items-baseline gap-1.5">
          <span className="text-4xl font-bold tracking-[-.04em]">{yearly ? prices.yearly : prices.monthly}</span>
          <span className="text-neutral-400">{yearly ? "per year" : "per month"}</span>
        </p>
        <p className="mt-1.5 text-sm text-neutral-400">{yearly ? `That's ${prices.yearlyAsMonthly} a month, billed once a year.` : `Or ${prices.yearly} a year and save ${prices.save}.`}</p>
        <ul className="mt-7 grid gap-3 text-[0.9375rem] text-neutral-200">
          <Feature inverted>Everything in Free</Feature>
          <Feature inverted>Notes up to 8 MB, with room for photos</Feature>
          <Feature inverted>1 GB of encrypted storage</Feature>
          <Feature inverted>Supports an independent, open-source app</Feature>
        </ul>
      </article>
    </div>
  </section>;
}

// Sample notes for the live sidebar preview: the real NoteCard component, not a screenshot.
const PREVIEW_NOTES = [
  { id: "skye", title: "Skye, late September", excerpt: "Walk the Quiraing loop before 9, while the car park still has space.", tags: ["travel"], favorite: true, color: "blue", dateLabel: "Oct 6" },
  { id: "reading", title: "Reading list", excerpt: "Piranesi, The Dispossessed, Tomorrow and Tomorrow and Tomorrow", tags: ["books"], favorite: true, dateLabel: "Oct 5" },
  { id: "session", title: "Session notes", excerpt: "", tags: ["private"], color: "purple", locked: true, dateLabel: "Oct 4" },
  { id: "budget", title: "Q4 budget draft", excerpt: "Hosting stays flat. Move the design contract to January.", tags: ["work"], color: "yellow", dateLabel: "Oct 3" },
  { id: "miso", title: "Miso aubergine", excerpt: "Score deeply, roast at 220°C, glaze with white miso and mirin.", tags: ["recipes"], color: "green", dateLabel: "Oct 1" },
];

function LiveNoteList() {
  const [favourites, setFavourites] = useState(() => new Set(PREVIEW_NOTES.filter((note) => note.favorite).map((note) => note.id)));
  const toggle = (id: string) => setFavourites((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const card = (note: (typeof PREVIEW_NOTES)[number]) => <NoteCard key={note.id} {...note} favorite={favourites.has(note.id)} statusLabel="Saved" onToggleFavorite={() => toggle(note.id)} />;
  const starred = PREVIEW_NOTES.filter((note) => favourites.has(note.id));
  const others = PREVIEW_NOTES.filter((note) => !favourites.has(note.id));

  return <div className="mx-4 mt-auto rounded-t-2xl bg-white px-2 pt-3 ring-1 ring-neutral-900/[.06] [mask-image:linear-gradient(to_bottom,black_80%,transparent)] dark:bg-neutral-50 sm:mx-6">
    {starred.length > 0 && <div className="mb-3">
      <NoteSectionLabel icon={<Star size={13} weight="fill" className="text-amber-500" />} label="Favourites" count={starred.length} />
      {starred.map(card)}
    </div>}
    <NoteSectionLabel icon={<List size={13} weight="bold" />} label={starred.length ? "Other notes" : "All notes"} count={others.length} />
    {others.map(card)}
  </div>;
}

/** Live colour demo: the app's real swatches recolour a real note card. */
function LiveColourPicker() {
  const [color, setColor] = useState<string | undefined>("blue");
  return <div className="grid w-full gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
    <div className="pointer-events-none" aria-hidden="true">
      <NoteCard title="Skye, late September" excerpt="Walk the Quiraing loop before 9, while the car park still has space." tags={["travel"]} favorite color={color} dateLabel="Oct 6" statusLabel="Saved" selected />
    </div>
    <div className="rounded-2xl bg-white p-3 ring-1 ring-neutral-900/[.06] dark:bg-neutral-50">
      <p className="px-1 pb-2.5 text-[0.6875rem] font-medium text-neutral-500">Page colour</p>
      <NoteColorSwatches value={color} onChange={setColor} />
    </div>
  </div>;
}

function BentoCell({ title, body, className = "", children }: { title: string; body: string; className?: string; children?: ReactNode }) {
  return <article data-reveal className={`flex flex-col overflow-hidden rounded-2xl ring-1 ring-neutral-900/[.07] ${className}`}>
    <div className="p-6 sm:p-7">
      <h3 className="text-lg font-semibold tracking-tight text-neutral-950">{title}</h3>
      <p className="mt-2 max-w-[42ch] text-[0.9375rem] leading-relaxed text-neutral-600">{body}</p>
    </div>
    {children}
  </article>;
}

export function Landing() {
  const rootRef = useReveal();

  return <div ref={rootRef} className="min-h-[100dvh] overflow-x-clip bg-white text-neutral-950">
    <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
      <a {...linkProps("/")} className="flex items-center gap-2.5 text-[0.9375rem] font-semibold tracking-[-.01em]"><Logo /> DeezNote</a>
      <nav className="flex items-center gap-1.5 sm:gap-2">
        <a href="#pricing" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 hover:text-neutral-950 sm:block">Pricing</a>
        <a {...linkProps("/login")} className="rounded-lg px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 hover:text-neutral-950">Sign in</a>
        <a {...linkProps("/signup")} className={`${primaryButton} h-9 px-4`}>Create account</a>
      </nav>
    </header>

    <main>
      {/* Hero: copy left, the real app bleeding off the right edge on wide screens. */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-10 sm:px-8 lg:min-h-[min(calc(100dvh-4rem),44rem)] lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14 lg:pb-16 lg:pt-6">
        <div className="landing-rise">
          <h1 className="text-balance text-5xl font-bold leading-[1.02] tracking-[-.045em] sm:text-6xl lg:text-7xl">Notes only you can read.</h1>
          <p className="mt-6 max-w-[36ch] text-lg leading-relaxed text-neutral-600">DeezNote encrypts every note in your browser before it syncs, so our server only ever stores ciphertext.</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <a {...linkProps("/signup")} className={primaryButton}>Create account <ArrowRight size={16} weight="bold" /></a>
            <a {...linkProps("/login")} className={secondaryButton}>Sign in</a>
          </div>
        </div>
        <div className="landing-rise [animation-delay:120ms] lg:-mr-40 xl:-mr-56">
          <div className={`overflow-hidden rounded-2xl ring-1 ring-neutral-900/10 ${panelShadow}`}>
            <Shot name="workspace" width={1920} height={1200} eager className="block h-auto w-full" alt="The DeezNote app: a sidebar of coloured notes and an open travel note with a photo." />
          </div>
        </div>
      </section>

      {/* What leaves your device: the note on screen next to the row the server actually stores. */}
      <section className="mx-auto max-w-6xl px-5 pb-20 pt-8 sm:px-8 lg:pb-28 lg:pt-12">
        <div data-reveal className="max-w-2xl">
          <p className="text-[0.8125rem] font-semibold uppercase tracking-[.14em] text-amber-700">End-to-end encrypted</p>
          <h2 className="mt-4 text-3xl font-bold tracking-[-.035em] sm:text-4xl lg:text-5xl">This is all our server sees.</h2>
          <p className="mt-5 max-w-[60ch] text-lg leading-relaxed text-neutral-600">Your note is locked on your device with a key that only your passphrase can open. The copy we store is this.</p>
        </div>

        <div className="mt-14 grid items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:gap-6">
          <figure data-reveal className="flex flex-col overflow-hidden rounded-2xl bg-neutral-50 ring-1 ring-neutral-900/[.07]">
            <figcaption className="px-6 pt-5 text-sm font-medium text-neutral-500">On your screen</figcaption>
            <div className="relative mt-4 flex-1 overflow-hidden">
              {/* Shows the editor region of the full capture: x 560-1800, from y 150 down. */}
              <Shot name="workspace" width={1920} height={1200} alt="The Skye travel note as you see it in DeezNote." className="absolute left-[-45%] top-[-11%] h-auto w-[155%] max-w-none [mask-image:linear-gradient(to_bottom,black_75%,transparent)]" />
              <div className="aspect-[4/3]" />
            </div>
          </figure>

          <div className="flex items-center justify-center gap-2 py-1 text-sm font-medium text-neutral-500 lg:flex-col lg:py-0">
            <ArrowRight size={20} className="hidden text-amber-600 lg:block" />
            <ArrowDown size={20} className="text-amber-600 lg:hidden" />
            <span className="lg:max-w-[9ch] lg:text-center">Encrypted in your browser</span>
          </div>

          <figure data-reveal className="flex flex-col overflow-hidden rounded-2xl bg-neutral-100 ring-1 ring-neutral-900/[.07]">
            <figcaption className="px-6 pt-5 text-sm font-medium text-neutral-500">On our server</figcaption>
            <pre className="mt-4 flex-1 overflow-x-auto whitespace-pre-wrap break-all px-6 pb-6 font-mono text-[0.8125rem] leading-6 text-neutral-700">
              {"{\n"}{STORED_ROW.map(([key, value], index) => <span key={key}>{"  "}<span className="text-amber-700">"{key}"</span>: {key === "version" ? value : `"${value}"`}{index < STORED_ROW.length - 1 ? ",\n" : "\n"}</span>)}{"}"}
            </pre>
          </figure>
        </div>
      </section>

      {/* Five features, five cells: wide + tall on the first two rows, one full-width strip below. */}
      <section className="mx-auto max-w-6xl px-5 pb-20 sm:px-8 lg:pb-28">
        <h2 data-reveal className="max-w-2xl text-balance text-3xl font-bold tracking-[-.035em] sm:text-4xl">Private, and still pleasant to use.</h2>

        <div className="mt-12 grid gap-4 md:grid-cols-6">
          <BentoCell className="bg-neutral-50 md:col-span-4" title="A second lock for sensitive notes" body="Give any note its own password. Even an unlocked vault can't open it without one.">
            <div className="mt-auto flex justify-center px-6 pb-0 pt-2">
              <Shot name="unlock" width={768} height={788} alt="A locked note asking for its password." className="h-auto w-full max-w-[25rem] translate-y-6 rounded-t-2xl" />
            </div>
          </BentoCell>

          <BentoCell className="bg-neutral-50 md:col-span-2 md:row-span-2" title="Colour and star what matters" body="Favourites stay at the top. A page colour makes a note easy to spot. Try a star.">
            <LiveNoteList />
          </BentoCell>

          <BentoCell className="bg-amber-50 dark:bg-amber-50/45 md:col-span-2" title="Works offline" body="Keep writing on a plane. Changes sync when you're back, still encrypted.">
            <WifiSlash size={28} className="mx-7 mb-7 mt-auto text-amber-700" weight="duotone" />
          </BentoCell>

          <BentoCell className="bg-neutral-50 md:col-span-2" title="Markdown, photos included" body="Headings, lists and code as you type. Drop in a photo and resize it in place.">
            <MarkdownLogo size={28} className="mx-7 mb-7 mt-auto text-neutral-500" weight="duotone" />
          </BentoCell>

          <BentoCell className="bg-neutral-50 md:col-span-6 md:flex-row md:items-end" title="Pick a colour for every page" body="Ten page colours, in light and dark. Dark mode follows your system unless you pick one.">
            <div className="mt-2 px-6 pb-6 md:ml-auto md:mt-0 md:w-[34rem] md:p-7">
              <LiveColourPicker />
            </div>
          </BentoCell>
        </div>
      </section>

      <Pricing />

      {/* The honest trade-off: the limitation is the privacy promise, plus what that means for you. */}
      <section className="border-y border-neutral-200 bg-neutral-50">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-20 lg:py-28">
          <h2 data-reveal className="max-w-[16ch] text-balance text-4xl font-bold leading-[1.05] tracking-[-.04em] sm:text-5xl">We can't reset your passphrase. <span className="text-neutral-500">That's the point.</span></h2>

          <div data-reveal className="grid content-start gap-10 lg:pt-2">
            <div className="flex gap-4">
              <Key size={24} weight="duotone" className="mt-0.5 shrink-0 text-amber-700" />
              <div>
                <h3 className="font-semibold text-neutral-950">Your key never leaves your device</h3>
                <p className="mt-2 max-w-[46ch] leading-relaxed text-neutral-600">Your passphrase unlocks your notes inside your browser. We never receive it, so there is nothing to reset. Keep it somewhere safe.</p>
              </div>
            </div>
            <div className="flex gap-4 border-t border-neutral-200 pt-10">
              <Code size={24} weight="duotone" className="mt-0.5 shrink-0 text-amber-700" />
              <div>
                <h3 className="font-semibold text-neutral-950">Open source, not yet audited</h3>
                <p className="mt-2 max-w-[46ch] leading-relaxed text-neutral-600">Anyone can read how the encryption works. It has not had an independent audit yet, so hold off on your most sensitive secrets.</p>
                <a href={REPO_URL} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-[0.9375rem] font-medium text-amber-700 underline decoration-amber-400/60 underline-offset-4 transition hover:decoration-amber-600">Read the code <ArrowRight size={15} weight="bold" /></a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div data-reveal className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-5 py-16 sm:px-8 md:flex-row md:items-center">
          <h2 className="text-2xl font-bold tracking-[-.03em] sm:text-3xl">Start writing privately.</h2>
          <a {...linkProps("/signup")} className={primaryButton}>Create account <ArrowRight size={16} weight="bold" /></a>
        </div>
      </section>
    </main>

    <footer className="border-t border-neutral-200">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 text-sm text-neutral-500 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <span className="flex items-center gap-2.5 font-medium text-neutral-700"><Logo className="size-6" /> DeezNote</span>
        <div className="flex items-center gap-5">
          <a {...linkProps("/privacy")} className="transition hover:text-neutral-900">Privacy</a>
          <a {...linkProps("/terms")} className="transition hover:text-neutral-900">Terms</a>
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="transition hover:text-neutral-900">Read the code</a>
          <a {...linkProps("/login")} className="transition hover:text-neutral-900">Sign in</a>
        </div>
      </div>
    </footer>
  </div>;
}
