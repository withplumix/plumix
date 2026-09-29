import type { VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cva } from "class-variance-authority";

import { cn } from "./utils.js";

const inputVariants = cva(
  [
    "selection:bg-primary selection:text-primary-foreground file:text-foreground placeholder:text-muted-foreground h-9 w-full min-w-0 rounded-md border px-3 py-1 text-base transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
    "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
    "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
  ],
  {
    variants: {
      variant: {
        default: "border-input dark:bg-input/30 bg-transparent shadow-xs",
        // Text that edits in place, like a document title: no box until
        // the pointer or the focus reaches it.
        inline:
          "hover:bg-accent focus-visible:bg-background border-transparent bg-transparent",
        // A value the server generated for the reader to copy, like a token
        // or an invite link.
        generated:
          "border-input bg-muted text-muted-foreground font-mono shadow-xs",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Input({
  className,
  type,
  variant = "default",
  ...props
}: React.ComponentProps<"input"> & VariantProps<typeof inputVariants>) {
  return (
    <input
      type={type}
      data-slot="input"
      data-variant={variant}
      className={cn(inputVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Input };
