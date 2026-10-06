import { useEffect, useState } from "react";

export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "deeznote-theme";
const NEXT: Record<ThemePreference, ThemePreference> = { system: "light", light: "dark", dark: "system" };
const media = window.matchMedia("(prefers-color-scheme: dark)");

function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // Storage can be unavailable (private mode); fall back to the system theme.
  }
  return "system";
}

function apply(preference: ThemePreference) {
  const dark = preference === "dark" || (preference === "system" && media.matches);
  document.documentElement.classList.toggle("dark", dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#11110f" : "#ffffff");
}

export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(readPreference);

  useEffect(() => {
    apply(preference);
    try {
      if (preference === "system") localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // Not persisting is fine; the theme still applies for this session.
    }
    if (preference !== "system") return;
    const onChange = () => apply("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [preference]);

  return { preference, set: setPreference, cycle: () => setPreference((current) => NEXT[current]) };
}
