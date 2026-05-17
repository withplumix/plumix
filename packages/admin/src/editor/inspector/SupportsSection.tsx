import type { ReactElement } from "react";

import type { BlockStyleSlot, BlockSupports } from "@plumix/blocks";

interface SupportsSectionProps {
  readonly supports: BlockSupports;
  readonly style: BlockStyleSlot;
  readonly onChange: (next: BlockStyleSlot) => void;
}

/**
 * Inspector controls for the supports axes a spec opts into. Each
 * declared axis renders one input that writes to `attrs.style.<axis>`.
 * Renders `null` when no axis is declared so the Inspector can mount
 * `<SupportsSection>` unconditionally and stay clean when off.
 *
 * v1 keeps controls minimal — text inputs for token-slug fields and
 * the anchor / customClassName slots. A follow-up Inspector polish
 * pass swaps the slug fields for token-aware pickers; the data flow
 * (one axis → one slot path) is the stable contract.
 */
export function SupportsSection({
  supports,
  style,
  onChange,
}: SupportsSectionProps): ReactElement | null {
  const rows = collectRows(supports, style);
  if (rows.length === 0) return null;
  return (
    <div data-testid="inspector-supports-section" data-plumix-supports="">
      {rows.map((row) => (
        <label key={row.path} data-plumix-supports-row={row.path}>
          <span>{row.label}</span>
          <input
            data-testid={`inspector-supports-${row.path}`}
            value={row.value}
            onChange={(e) =>
              onChange(setSlotValue(style, row.path, e.target.value))
            }
          />
        </label>
      ))}
    </div>
  );
}

interface SupportsRow {
  readonly path: string;
  readonly label: string;
  readonly value: string;
}

interface RowDef {
  readonly path: string;
  readonly label: string;
  readonly enabled: (s: BlockSupports) => boolean | undefined;
  readonly value: (s: BlockStyleSlot) => string | undefined;
}

// Ordering here drives Inspector row order — keep in sync with
// `resolveBlockStyles`' axis order so what authors see top-to-bottom
// matches what the renderer applies.
const ROW_DEFS: readonly RowDef[] = [
  {
    path: "color.background",
    label: "Background color",
    enabled: (s) => s.color?.background,
    value: (s) => s.color?.background,
  },
  {
    path: "color.text",
    label: "Text color",
    enabled: (s) => s.color?.text,
    value: (s) => s.color?.text,
  },
  {
    path: "spacing.padding",
    label: "Padding",
    enabled: (s) => s.spacing?.padding,
    value: (s) => s.spacing?.padding,
  },
  {
    path: "spacing.margin",
    label: "Margin",
    enabled: (s) => s.spacing?.margin,
    value: (s) => s.spacing?.margin,
  },
  {
    path: "typography.fontSize",
    label: "Font size",
    enabled: (s) => s.typography?.fontSize,
    value: (s) => s.typography?.fontSize,
  },
  {
    path: "typography.lineHeight",
    label: "Line height",
    enabled: (s) => s.typography?.lineHeight,
    value: (s) => s.typography?.lineHeight,
  },
  {
    path: "typography.fontWeight",
    label: "Font weight",
    enabled: (s) => s.typography?.fontWeight,
    value: (s) => s.typography?.fontWeight,
  },
  {
    path: "typography.textAlign",
    label: "Text align",
    enabled: (s) => s.typography?.textAlign,
    value: (s) => s.typography?.textAlign,
  },
  {
    path: "border.radius",
    label: "Border radius",
    enabled: (s) => s.border?.radius,
    value: (s) => s.border?.radius,
  },
  {
    path: "align",
    label: "Align",
    enabled: (s) => s.align,
    value: (s) => s.align,
  },
  {
    path: "anchor",
    label: "HTML anchor",
    enabled: (s) => s.anchor,
    value: (s) => s.anchor,
  },
  {
    path: "customClassName",
    label: "Additional CSS class",
    enabled: (s) => s.customClassName,
    value: (s) => s.customClassName,
  },
];

function collectRows(
  supports: BlockSupports,
  style: BlockStyleSlot,
): SupportsRow[] {
  const rows: SupportsRow[] = [];
  for (const def of ROW_DEFS) {
    if (!def.enabled(supports)) continue;
    rows.push({
      path: def.path,
      label: def.label,
      value: def.value(style) ?? "",
    });
  }
  return rows;
}

function setSlotValue(
  slot: BlockStyleSlot,
  path: string,
  value: string,
): BlockStyleSlot {
  const [head, tail] = path.split(".") as [string, string | undefined];
  if (tail === undefined) {
    // Top-level path (anchor, align, customClassName). An empty string
    // clears the slot so the resolver doesn't emit an empty class.
    const next = { ...(slot as Record<string, unknown>) };
    if (value === "") delete next[head];
    else next[head] = value;
    return next;
  }
  const nested =
    (slot as Record<string, Record<string, unknown> | undefined>)[head] ?? {};
  const updatedNested = { ...nested };
  if (value === "") delete updatedNested[tail];
  else updatedNested[tail] = value;
  const next = {
    ...(slot as Record<string, unknown>),
    [head]: updatedNested,
  };
  return next;
}
