"use client";

import type { VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cva } from "class-variance-authority";
import { Label as LabelPrimitive } from "radix-ui";

import { cn } from "./utils.js";

const labelVariants = cva(
  "flex items-center gap-2 text-sm leading-none select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "font-medium",
        // One option in a radio or checkbox group, read as body text beside
        // its control rather than as a field's name.
        choice: "font-normal",
        // A secondary name set above a control that already has context,
        // like the row a rename field sits in.
        caption: "text-muted-foreground text-xs font-medium",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Label({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root> &
  VariantProps<typeof labelVariants>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      data-variant={variant}
      className={cn(labelVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Label };
