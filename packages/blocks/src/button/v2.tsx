import type { ReactNode } from "react";

import { defineBlock } from "../block-registry.js";

const VARIANTS = ["primary", "secondary", "outline", "ghost"] as const;
const SIZES = ["sm", "md", "lg"] as const;

const SAFE_HREF = /^(https?:\/\/|mailto:|tel:|\/|#|\?|\.\.?\/)/i;

function pickFrom<T extends string>(
  raw: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof raw === "string" && (allowed as readonly string[]).includes(raw)
    ? (raw as T)
    : fallback;
}

function sanitizeHref(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 && SAFE_HREF.test(trimmed) ? trimmed : undefined;
}

export const buttonBlockV2 = defineBlock({
  name: "core/button",
  title: "Button",
  icon: "MousePointerClick",
  category: "interactive",
  inputs: [
    { name: "label", type: "text", label: "Label" },
    { name: "href", type: "text", label: "Href" },
    {
      name: "variant",
      type: "select",
      label: "Variant",
      options: VARIANTS.map((v) => ({ label: v, value: v })),
    },
    {
      name: "size",
      type: "select",
      label: "Size",
      options: SIZES.map((s) => ({ label: s, value: s })),
    },
  ],
  defaults: { label: "Click", variant: "primary", size: "md" },
  render: ({ attrs }): ReactNode => {
    const label = (attrs.label as string | undefined) ?? "";
    const href = sanitizeHref(attrs.href);
    const variant = pickFrom(attrs.variant, VARIANTS, "primary");
    const size = pickFrom(attrs.size, SIZES, "md");
    if (href) {
      return (
        <a href={href} data-variant={variant} data-size={size}>
          {label}
        </a>
      );
    }
    return (
      <button type="button" data-variant={variant} data-size={size}>
        {label}
      </button>
    );
  },
});
