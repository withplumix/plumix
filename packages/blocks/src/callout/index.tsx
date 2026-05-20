import type { ReactNode } from "react";

import { defineBlock } from "../block-registry.js";

const VARIANTS = ["info", "warn", "error", "success", "note"] as const;
type CalloutVariant = (typeof VARIANTS)[number];

function pickVariant(raw: unknown): CalloutVariant {
  return typeof raw === "string" && (VARIANTS as readonly string[]).includes(raw)
    ? (raw as CalloutVariant)
    : "info";
}

export const calloutBlock = defineBlock({
  name: "core/callout",
  title: "Callout",
  icon: "Megaphone",
  category: "layout",
  inputs: [
    {
      name: "variant",
      type: "select",
      label: "Variant",
      options: VARIANTS.map((v) => ({ label: v, value: v })),
    },
    { name: "icon", type: "text", label: "Icon" },
    { name: "content", type: "slot", label: "Content" },
  ],
  defaults: { variant: "info" },
  render: ({ attrs }): ReactNode => {
    const variant = pickVariant(attrs.variant);
    const iconRaw = attrs.icon as string | undefined;
    const icon = typeof iconRaw === "string" && iconRaw.length > 0 ? iconRaw : undefined;
    const Content = attrs.content as (() => ReactNode) | undefined;
    return (
      <aside role="note" data-variant={variant} data-icon={icon}>
        {Content ? <Content /> : null}
      </aside>
    );
  },
});
