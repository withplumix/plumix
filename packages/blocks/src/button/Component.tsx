import type { ReactElement } from "react";

import type { BlockProps } from "../types.js";

const VARIANTS = ["primary", "secondary", "outline", "ghost"] as const;
const SIZES = ["sm", "md", "lg"] as const;

// Shared with the walker's link sanitizer — kept verbatim so behaviour
// stays in lockstep across the two surfaces. If this list ever drifts
// from `walker.tsx`'s SAFE_HREF, the parity test in @plumix/core will
// catch it.
const SAFE_HREF = /^(https?:\/\/|mailto:|tel:|\/|#|\?|\.\.?\/)/i;

function asAllowed<T extends string>(
  raw: unknown,
  allowed: readonly T[],
): T | undefined {
  return typeof raw === "string" && (allowed as readonly string[]).includes(raw)
    ? (raw as T)
    : undefined;
}

function sanitizeHref(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (trimmed === "" || !SAFE_HREF.test(trimmed)) return undefined;
  return trimmed;
}

export function ButtonComponent({ attrs }: BlockProps): ReactElement {
  const href = sanitizeHref(attrs.href);
  const text = typeof attrs.text === "string" ? attrs.text : "";
  const variant = asAllowed(attrs.variant, VARIANTS);
  const size = asAllowed(attrs.size, SIZES);
  const target = attrs.target === "_blank" ? "_blank" : undefined;
  const rel = target === "_blank" ? "noopener noreferrer" : undefined;
  return (
    <a
      href={href}
      target={target}
      rel={rel}
      data-plumix-block="core/button"
      data-variant={variant}
      data-size={size}
    >
      {text}
    </a>
  );
}
