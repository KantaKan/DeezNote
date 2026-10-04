import type { ComponentProps } from "react";
import { cn } from "../../lib/utils";

export function Input({ className, type, ...props }: ComponentProps<"input">) {
  return <input
    type={type}
    data-slot="input"
    className={cn("h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-950 outline-none transition placeholder:text-neutral-400 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 disabled:cursor-not-allowed disabled:opacity-50", className)}
    {...props}
  />;
}
