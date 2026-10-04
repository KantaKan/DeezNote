import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors outline-none disabled:pointer-events-none disabled:opacity-45 focus-visible:ring-2 focus-visible:ring-amber-400/50 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-neutral-900 text-white hover:bg-neutral-800",
        accent: "bg-amber-400 text-amber-950 hover:bg-amber-300",
        destructive: "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-400/50",
        outline: "border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-100",
        ghost: "text-neutral-600 hover:bg-neutral-200/70 hover:text-neutral-950",
      },
      size: {
        default: "h-9 px-4",
        sm: "h-8 rounded-md px-3 text-xs",
        icon: "size-9 p-0",
        "icon-sm": "size-8 rounded-md p-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild, ...props }: ButtonProps) {
  const Component = asChild ? Slot : "button";
  return <Component data-slot="button" className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
