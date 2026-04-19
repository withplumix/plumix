import type * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "destructive";

const variantClasses: Record<Variant, string> = {
  default: "bg-card text-card-foreground",
  destructive:
    "border-destructive/50 text-destructive bg-destructive/5 [&>svg]:text-destructive",
};

export interface AlertProps extends React.ComponentProps<"div"> {
  readonly variant?: Variant;
}

export function Alert({
  className,
  variant = "default",
  role = "alert",
  ...props
}: AlertProps) {
  return (
    <div
      data-slot="alert"
      role={role}
      className={cn(
        "relative w-full rounded-lg border px-4 py-3 text-sm",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}

export function AlertTitle({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn("mb-1 leading-none font-medium", className)}
      {...props}
    />
  );
}

export function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn("text-sm [&_p]:leading-relaxed", className)}
      {...props}
    />
  );
}
