import { cn } from "../lib/utils";

// Same artwork as public/favicon.svg so the in-app mark matches the app icon.
export function Logo({ className }: { className?: string }) {
  return <svg className={cn("size-8 shrink-0", className)} viewBox="0 0 512 512" aria-hidden="true">
    <rect width="512" height="512" rx="116" fill="#11110f" />
    <path d="M156 92h146l78 78v234a20 20 0 0 1-20 20H156a20 20 0 0 1-20-20V112a20 20 0 0 1 20-20Z" fill="#f4f1e8" />
    <path d="M302 92v58a20 20 0 0 0 20 20h58Z" fill="#facc15" />
    <path fill="#11110f" fillRule="evenodd" d="M192 206h58a74 74 0 0 1 0 148h-58Zm40 38v72h18a36 36 0 0 0 0-72Z" />
  </svg>;
}
