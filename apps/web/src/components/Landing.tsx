import { ArrowRight, Check, Code, Crown, DeviceMobile, Key, List, LockSimple, MarkdownLogo, MoonStars, Star, WifiSlash } from "@phosphor-icons/react";
import "@fontsource-variable/bricolage-grotesque";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { REPO_URL } from "../legal/policy";
import { linkProps } from "../lib/router";
import { Logo } from "./Logo";
import { NoteCard, NoteSectionLabel } from "./NoteCard";
import { NoteColorSwatches } from "./NoteColorPicker";

// Public front door. Light and dark come from the same palette tokens as the app (styles.css).
// Display type: Bricolage Grotesque (headlines only); body stays Inter like the app.
// Shape system: buttons and chips are pills, panels are rounded-3xl, app components keep their own radii.
// Amber classes are mirrored in dark mode, so bright amber in dark needs the dark: overrides below.

const primaryButton = "inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-amber-400 px-6 text-[0.9375rem] font-semibold text-amber-950 transition hover:bg-amber-300 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-400/40 dark:bg-amber-600 dark:text-amber-50 dark:hover:bg-amber-700";
const secondaryButton = "inline-flex h-12 items-center justify-center whitespace-nowrap rounded-full px-6 text-[0.9375rem] font-medium text-neutral-800 ring-1 ring-neutral-300 transition hover:bg-neutral-100 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-400/40";
const panelShadow = "shadow-[0_30px_80px_-40px_rgb(17_17_15/0.5)]";
const display = "font-display font-bold tracking-[-0.035em]";

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

// Pro pricing as numbers, so the savings calculator can do the maths. Thai visitors see baht; everyone else US dollars.
const PLANS = {
  thb: { currency: "THB", locale: "th-TH", decimals: 0, monthly: 79, yearly: 490 },
  usd: { currency: "USD", locale: "en-US", decimals: 2, monthly: 2.99, yearly: 17.99 },
} as const;
type PlanPrices = (typeof PLANS)[keyof typeof PLANS];

function localPlan(): PlanPrices {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return zone === "Asia/Bangkok" || navigator.language.toLowerCase().startsWith("th") ? PLANS.thb : PLANS.usd;
}

function money(amount: number, plan: PlanPrices) {
  return new Intl.NumberFormat(plan.locale, { style: "currency", currency: plan.currency, minimumFractionDigits: plan.decimals, maximumFractionDigits: plan.decimals }).format(Math.round(amount * 100) / 100);
}

function savePercent(plan: PlanPrices) {
  return Math.round((1 - plan.yearly / (plan.monthly * 12)) * 100);
}

// Real output of encryptNote() for the "Skye, late September" note (see git history for how it was made).
const DEMO = {
  title: "Skye, late September",
  body: "Walk the Quiraing loop before 9, while the car park still has space. The Mallaig ferry fills up, so book the 10:40.",
  titleCipher: "bCczmbcpLDK3kkc9LiSJ",
  bodyCipher: "A0xQjkJxDhiIE9wDBkKwR7HyJ0zl64z1W3OwHZLdCmwGCv0qKDkX85RhJyCE2oxjjMGnhVJGZ6i/VNnhVCIx7hk7sAgIhvqt0/0mUunPGSY6",
};
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Scrambles text from one string to another by writing to the DOM directly (no React re-render per frame). */
function scramble(element: HTMLElement, from: string, to: string, progress: number) {
  const length = Math.round(from.length + (to.length - from.length) * progress);
  const settled = Math.floor(length * progress);
  let out = to.slice(0, settled);
  for (let i = settled; i < length; i++) out += progress === 0 ? from[i] ?? "" : B64[(Math.random() * B64.length) | 0];
  element.textContent = out;
}

/** Hero demo: the note as you see it, scrambling into exactly what our server stores, and back. */
function EncryptionDemo() {
  const [encrypted, setEncrypted] = useState(false);
  const [reduced] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  const titleRef = useRef<HTMLParagraphElement>(null);
  const bodyRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (reduced) return;
    let timer: number;
    let frame = 0;
    let toCipher = true;
    const FRAMES = 28;
    const animate = () => {
      frame++;
      const progress = frame / FRAMES;
      const [t0, t1] = toCipher ? [DEMO.title, DEMO.titleCipher] : [DEMO.titleCipher, DEMO.title];
      const [b0, b1] = toCipher ? [DEMO.body, DEMO.bodyCipher] : [DEMO.bodyCipher, DEMO.body];
      if (titleRef.current) scramble(titleRef.current, t0, t1, progress);
      if (bodyRef.current) scramble(bodyRef.current, b0, b1, progress);
      if (frame < FRAMES) { timer = window.setTimeout(animate, 38); return; }
      frame = 0;
      toCipher = !toCipher;
      timer = window.setTimeout(start, 2600);
    };
    const start = () => { setEncrypted(toCipher); animate(); };
    timer = window.setTimeout(start, 1800);
    return () => window.clearTimeout(timer);
  }, [reduced]);

  const card = (cipher: boolean, live: boolean) => <div className={`rounded-3xl bg-white p-6 ring-1 ring-neutral-900/[.08] sm:p-7 ${panelShadow}`}>
    <div className="flex items-center justify-between text-xs font-medium">
      <span className="flex items-center gap-1.5 text-neutral-500">{cipher ? <><LockSimple size={13} weight="fill" className="text-amber-500" /> On our server</> : "On your screen"}</span>
      <span className={`rounded-full px-2 py-0.5 ${cipher ? "bg-amber-100 text-amber-800" : "bg-neutral-100 text-neutral-500"}`}>{cipher ? "Encrypted" : "Only you"}</span>
    </div>
    <p ref={live ? titleRef : undefined} className={`mt-5 break-all text-lg font-semibold ${cipher ? "font-mono text-[0.9375rem] text-neutral-700" : ""}`}>{cipher ? DEMO.titleCipher : DEMO.title}</p>
    <p ref={live ? bodyRef : undefined} className={`mt-2 min-h-[6.5rem] break-all leading-relaxed ${cipher ? "font-mono text-[0.8125rem] text-neutral-500" : "text-[0.9375rem] text-neutral-600"}`}>{cipher ? DEMO.bodyCipher : DEMO.body}</p>
  </div>;

  return <div className="relative">
    {/* The amber slab behind the card is the page's one brand flourish. */}
    <div aria-hidden="true" className="absolute inset-0 translate-x-4 translate-y-4 rounded-3xl bg-amber-400 dark:bg-amber-600 sm:translate-x-6 sm:translate-y-6" />
    <div className="relative">
      {reduced
        ? <div className="grid gap-3">{card(false, false)}{card(true, false)}</div>
        : card(encrypted, true)}
    </div>
  </div>;
}

function Feature({ children, inverted = false }: { children: ReactNode; inverted?: boolean }) {
  return <li className="flex gap-2.5"><Check size={16} weight="bold" className={`mt-1 shrink-0 ${inverted ? "text-amber-400" : "text-amber-600"}`} />{children}</li>;
}

/** Drag the years; see what paying monthly vs yearly costs and what yearly keeps in your pocket. */
function SavingsCalculator({ plan }: { plan: PlanPrices }) {
  const [years, setYears] = useState(3);
  const monthlyTotal = plan.monthly * 12 * years;
  const yearlyTotal = plan.yearly * years;
  const saved = monthlyTotal - yearlyTotal;
  const freeMonths = Math.floor(saved / plan.monthly);

  return <div data-reveal className="mt-16 grid gap-10 border-t border-neutral-200 pt-12 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-end md:gap-16">
    <div>
      <h3 className={`${display} text-3xl sm:text-4xl`}>See what yearly saves you</h3>
      <p className="mt-3 text-[0.9375rem] leading-relaxed text-neutral-600">Drag to how long you'd keep Pro.</p>
      <label className="mt-8 block">
        <span className="flex items-baseline justify-between text-sm">
          <span className="font-medium text-neutral-800">Years of Pro</span>
          <span className={`${display} text-3xl tabular-nums`}>{years}</span>
        </span>
        <input type="range" min={1} max={5} step={1} value={years} onChange={(event) => setYears(Number(event.target.value))} className="savings-range mt-4 w-full" style={{ "--fill": `${((years - 1) / 4) * 100}%` } as CSSProperties} aria-valuetext={`${years} ${years === 1 ? "year" : "years"}`} />
        <span className="mt-1 flex justify-between px-1 text-xs tabular-nums text-neutral-400" aria-hidden="true">{[1, 2, 3, 4, 5].map((n) => <span key={n}>{n}</span>)}</span>
      </label>
    </div>

    <div role="status" aria-live="polite">
      <dl className="grid gap-3 text-[0.9375rem]">
        <div className="flex items-baseline justify-between gap-4"><dt className="text-neutral-600">Paying monthly</dt><dd className="tabular-nums text-neutral-500 line-through decoration-neutral-400/70">{money(monthlyTotal, plan)}</dd></div>
        <div className="flex items-baseline justify-between gap-4"><dt className="text-neutral-600">Paying yearly</dt><dd className="font-medium tabular-nums text-neutral-900">{money(yearlyTotal, plan)}</dd></div>
      </dl>
      <p className="mt-6 text-sm font-medium text-neutral-600">You save</p>
      <p className={`${display} mt-1 text-6xl tabular-nums text-amber-600 sm:text-7xl`}>{money(saved, plan)}</p>
      <p className="mt-2 text-sm text-neutral-500">That's {freeMonths} months of Pro, free.</p>
    </div>
  </div>;
}

function Pricing() {
  const [yearly, setYearly] = useState(true);
  const plan = localPlan();
  const percent = savePercent(plan);

  return <section id="pricing" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-24 sm:px-8 lg:py-32">
    <div data-reveal className="flex flex-col items-start justify-between gap-8 md:flex-row md:items-end">
      <h2 className={`${display} max-w-[20ch] text-balance text-5xl leading-[0.95] sm:text-6xl`}>Free to start. Pro when you need room.</h2>
      <div className="flex rounded-full bg-neutral-100 p-1 text-sm" role="radiogroup" aria-label="Billing period">
        {[{ value: true, label: "Yearly" }, { value: false, label: "Monthly" }].map(({ value, label }) => <button
          key={label}
          type="button"
          role="radio"
          aria-checked={yearly === value}
          className={`flex items-center gap-2 rounded-full px-4 py-2 font-medium transition ${yearly === value ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-800"}`}
          onClick={() => setYearly(value)}
        >{label}{value && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[0.6875rem] font-semibold text-amber-800">Save {percent}%</span>}</button>)}
      </div>
    </div>

    <div className="mt-14 grid gap-5 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <article data-reveal className="flex flex-col rounded-3xl p-8 ring-1 ring-neutral-900/10 sm:p-10">
        <h3 className="text-lg font-semibold tracking-tight">Free</h3>
        <p className="mt-5 flex items-baseline gap-2"><span className={`${display} text-6xl tabular-nums`}>{plan.currency === "THB" ? "฿0" : "$0"}</span><span className="text-neutral-500">forever</span></p>
        <p className="mt-2 text-sm text-neutral-500">Everything you need to write privately.</p>
        <ul className="mt-8 grid gap-3 text-[0.9375rem] text-neutral-700">
          <Feature>End-to-end encryption on every note</Feature>
          <Feature>Works offline, syncs across your devices</Feature>
          <Feature>Note passwords, colours and favourites</Feature>
          <Feature>256 KB per note, 25 MB in total</Feature>
        </ul>
        <div className="mt-auto pt-10"><a {...linkProps("/signup")} className={secondaryButton}>Create account</a></div>
      </article>

      {/* Premium through restraint: a fine amber edge and one soft warm light, no glow. */}
      <article data-reveal className={`relative isolate flex flex-col overflow-hidden rounded-3xl bg-neutral-900 p-8 text-neutral-50 ring-1 ring-amber-400/40 sm:p-10 ${panelShadow}`}>
        <span aria-hidden="true" className="pointer-events-none absolute -right-28 -top-28 -z-10 size-80 rounded-full bg-amber-400/15 blur-3xl" />
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-10 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-amber-300/70 to-transparent" />
        <div className="flex items-center justify-between gap-4">
          <h3 className="flex items-center gap-2 text-lg font-semibold tracking-tight"><Crown size={18} weight="duotone" className="text-amber-400" /> Pro</h3>
          <span className="rounded-full bg-amber-400 px-2.5 py-1 text-xs font-semibold text-amber-950">Best value</span>
        </div>
        <div className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {yearly && <span className="text-xl tabular-nums text-neutral-500 line-through decoration-neutral-500/70">{money(plan.monthly * 12, plan)}</span>}
          <span className={`${display} text-6xl tabular-nums`}>{money(yearly ? plan.yearly : plan.monthly, plan)}</span>
          <span className="text-neutral-400">{yearly ? "per year" : "per month"}</span>
        </div>
        <p className="mt-2 text-sm text-neutral-400">{yearly ? `${money(plan.yearly / 12, plan)} a month, billed once a year.` : `Switch to yearly and save ${percent}%.`}</p>
        <ul className="mt-8 grid gap-3 text-[0.9375rem] text-neutral-200">
          <Feature inverted>Everything in Free</Feature>
          <Feature inverted>Notes up to 8 MB, with room for photos</Feature>
          <Feature inverted>1 GB of encrypted storage</Feature>
          <Feature inverted>Supports an independent, open-source app</Feature>
        </ul>
        <p className="mt-10 border-t border-white/10 pt-5 text-sm text-neutral-400">Coming soon. Start on Free today and your notes come with you.</p>
      </article>
    </div>

    <SavingsCalculator plan={plan} />
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

function FeatureRow({ title, body, visual, flip = false }: { title: string; body: string; visual: ReactNode; flip?: boolean }) {
  return <div data-reveal className="grid items-center gap-10 md:grid-cols-2 md:gap-16">
    <div className={flip ? "md:order-2" : ""}>
      <h3 className={`${display} max-w-[14ch] text-balance text-4xl leading-[1] sm:text-5xl`}>{title}</h3>
      <p className="mt-5 max-w-[40ch] text-lg leading-relaxed text-neutral-600">{body}</p>
    </div>
    <div className={flip ? "md:order-1" : ""}>{visual}</div>
  </div>;
}

const FACTS = [
  { icon: WifiSlash, title: "Works offline", body: "Keep writing on a plane. Changes sync when you're back, still encrypted." },
  { icon: MarkdownLogo, title: "Markdown and photos", body: "Headings, lists and code as you type. Resize photos in place." },
  { icon: MoonStars, title: "Light and dark", body: "Follows your system, or pick one in your profile." },
  { icon: DeviceMobile, title: "Install it like an app", body: "Add DeezNote to your home screen or dock." },
];

export function Landing() {
  const rootRef = useReveal();

  return <div ref={rootRef} className="min-h-[100dvh] overflow-x-clip bg-white text-neutral-950">
    <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
      <a {...linkProps("/")} className="flex items-center gap-2.5 text-[0.9375rem] font-semibold tracking-[-.01em]"><Logo /> DeezNote</a>
      <nav className="flex items-center gap-1 sm:gap-2">
        <a href="#pricing" className="hidden rounded-full px-3.5 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 hover:text-neutral-950 sm:block">Pricing</a>
        <a {...linkProps("/login")} className="rounded-full px-3.5 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 hover:text-neutral-950">Sign in</a>
        <a {...linkProps("/signup")} className={`${primaryButton} h-10 px-5 text-sm`}>Create account</a>
      </nav>
    </header>

    <main>
      {/* Hero: the claim on the left, the proof on the right (your note scrambling into what we store). */}
      <section className="mx-auto grid max-w-6xl items-center gap-14 px-5 pb-24 pt-12 sm:px-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-16 lg:pb-32 lg:pt-20">
        <div className="landing-rise">
          <h1 className={`${display} text-balance text-6xl leading-[0.92] sm:text-7xl lg:text-[4.75rem]`}>Notes only <span className="text-amber-500">you</span> can read.</h1>
          <p className="mt-7 max-w-[34ch] text-lg leading-relaxed text-neutral-600 sm:text-xl">Every note is encrypted in your browser before it syncs. Our server only ever sees the scrambled version.</p>
          <div className="mt-10 flex flex-wrap gap-3">
            <a {...linkProps("/signup")} className={primaryButton}>Create account <ArrowRight size={17} weight="bold" /></a>
            <a {...linkProps("/login")} className={secondaryButton}>Sign in</a>
          </div>
        </div>
        <div className="landing-rise mr-4 [animation-delay:150ms] sm:mr-6">
          <EncryptionDemo />
        </div>
      </section>

      {/* The real app, on a warm stage. */}
      <section className="mx-auto max-w-6xl px-5 sm:px-8">
        <div data-reveal className="overflow-hidden rounded-3xl bg-amber-100 px-4 pt-8 dark:bg-amber-100/30 sm:px-12 sm:pt-14">
          <div className={`overflow-hidden rounded-t-2xl ring-1 ring-neutral-900/10 ${panelShadow}`}>
            <Shot name="workspace" width={1920} height={1200} className="block h-auto w-full" alt="The DeezNote app: a sidebar of coloured notes and an open travel note with a photo." />
          </div>
        </div>
      </section>

      {/* Features: alternating rows with live components, then a full-width demo, then quick facts. */}
      <section className="mx-auto max-w-6xl px-5 py-24 sm:px-8 lg:py-32">
        <h2 data-reveal className={`${display} max-w-[16ch] text-balance text-5xl leading-[0.95] sm:text-6xl`}>Private, and still pleasant to use.</h2>

        <div className="mt-20 grid gap-24 lg:gap-32">
          <FeatureRow
            title="A second lock for sensitive notes"
            body="Give any note its own password. Even an unlocked vault can't open it without one."
            visual={<div className="flex justify-center"><Shot name="unlock" width={768} height={788} alt="A locked note asking for its password." className="h-auto w-full max-w-[26rem]" /></div>}
          />
          <FeatureRow
            flip
            title="Colour and star what matters"
            body="Favourites stay at the top. A page colour makes a note easy to spot. Try a star."
            visual={<div className="max-h-[30rem] overflow-hidden rounded-3xl bg-neutral-50 pb-0 pt-3 ring-1 ring-neutral-900/[.06]"><LiveNoteList /></div>}
          />
          <div data-reveal className="text-center">
            <h3 className={`${display} mx-auto max-w-[18ch] text-balance text-4xl leading-[1] sm:text-5xl`}>A colour for every page</h3>
            <p className="mx-auto mt-5 max-w-[44ch] text-lg leading-relaxed text-neutral-600">Ten page colours, in light and dark. Pick one and watch the note change.</p>
            <div className="mx-auto mt-10 max-w-2xl text-left"><LiveColourPicker /></div>
          </div>
        </div>

        <div data-reveal className="mt-28 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {FACTS.map(({ icon: Icon, title, body }) => <div key={title} className="border-t border-neutral-200 pt-6">
            <Icon size={24} weight="duotone" className="text-amber-600" />
            <h3 className="mt-4 font-semibold tracking-tight">{title}</h3>
            <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-neutral-600">{body}</p>
          </div>)}
        </div>
      </section>

      <Pricing />

      {/* The honest trade-off: the limitation is the privacy promise, plus what that means for you. */}
      <section className="mx-auto max-w-6xl px-5 pb-24 sm:px-8 lg:pb-32">
        <h2 data-reveal className={`${display} max-w-[15ch] text-balance text-5xl leading-[0.95] sm:text-6xl lg:text-7xl`}>We can't reset your passphrase. <span className="text-neutral-400">That's the point.</span></h2>
        <div data-reveal className="mt-14 grid gap-10 md:grid-cols-2 md:gap-16">
          <div className="border-t border-neutral-200 pt-6">
            <Key size={24} weight="duotone" className="text-amber-600" />
            <h3 className="mt-4 font-semibold tracking-tight">Your key never leaves your device</h3>
            <p className="mt-2 max-w-[46ch] leading-relaxed text-neutral-600">Your passphrase unlocks your notes inside your browser. We never receive it, so there is nothing to reset. Keep it somewhere safe.</p>
          </div>
          <div className="border-t border-neutral-200 pt-6">
            <Code size={24} weight="duotone" className="text-amber-600" />
            <h3 className="mt-4 font-semibold tracking-tight">Open source, not yet audited</h3>
            <p className="mt-2 max-w-[46ch] leading-relaxed text-neutral-600">Anyone can read how the encryption works. It has not had an independent audit yet, so hold off on your most sensitive secrets.</p>
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-[0.9375rem] font-medium text-amber-700 underline decoration-amber-400/60 underline-offset-4 transition hover:decoration-amber-600">Read the code <ArrowRight size={15} weight="bold" /></a>
          </div>
        </div>
      </section>

      {/* Closing call to action: the page's one full-colour block. */}
      <section className="mx-auto max-w-6xl px-5 pb-16 sm:px-8">
        <div data-reveal className="flex flex-col items-start justify-between gap-8 rounded-3xl bg-amber-400 px-8 py-14 dark:bg-amber-600 sm:px-14 sm:py-20 md:flex-row md:items-end">
          <h2 className={`${display} max-w-[12ch] text-balance text-5xl leading-[0.95] text-amber-950 dark:text-amber-50 sm:text-6xl`}>Start writing privately.</h2>
          <a {...linkProps("/signup")} className="inline-flex h-12 items-center gap-2 whitespace-nowrap rounded-full bg-neutral-900 px-6 text-[0.9375rem] font-semibold text-white transition hover:bg-neutral-800 active:scale-[0.98]">Create account <ArrowRight size={17} weight="bold" /></a>
        </div>
      </section>
    </main>

    <footer className="border-t border-neutral-200">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 text-sm text-neutral-500 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <span className="flex items-center gap-2.5 font-medium text-neutral-700"><Logo className="size-6" /> DeezNote</span>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <a {...linkProps("/privacy")} className="transition hover:text-neutral-900">Privacy</a>
          <a {...linkProps("/terms")} className="transition hover:text-neutral-900">Terms</a>
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="transition hover:text-neutral-900">Read the code</a>
          <a {...linkProps("/login")} className="transition hover:text-neutral-900">Sign in</a>
        </div>
      </div>
    </footer>
  </div>;
}
