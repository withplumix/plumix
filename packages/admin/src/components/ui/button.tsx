import type * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "outline" | "ghost";
type Size = "default" | "sm";

const variantClasses: Record<Variant, string> = {
  default:
    "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 focus-visible:ring-ring/50",
  outline:
    "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring/50",
  ghost:
    "hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring/50",
};

const sizeClasses: Record<Size, string> = {
  default: "h-9 px-4 py-2 text-sm",
  sm: "h-8 px-3 text-xs",
};

export interface ButtonProps extends React.ComponentProps<"button"> {
  readonly variant?: Variant;
  readonly size?: Size;
}

export function Button({
  className,
  variant = "default",
  size = "default",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      data-slot="button"
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  );
}
