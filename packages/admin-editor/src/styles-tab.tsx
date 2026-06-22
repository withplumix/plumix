import type { ReactElement } from "react";
import { Trans, useLingui } from "@lingui/react";

import type { StyleValue, ThemeTokens, TokenCategory } from "@plumix/blocks";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@plumix/admin-ui/accordion";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Strikethrough,
  Underline,
} from "@plumix/admin-ui/icons";
import { Toggle } from "@plumix/admin-ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@plumix/admin-ui/toggle-group";
import { normalizeStyleValue } from "@plumix/blocks";

import type { StyleBucket } from "./store.js";
import { findBlock } from "./block-tree-ops.js";
import { useEditorStore } from "./provider.js";
import { deviceBucket } from "./store.js";
import { StyleControl } from "./style-control.js";

interface StylesTabProps {
  readonly tokens: ThemeTokens;
}

interface ControlSpec {
  readonly property: string;
  readonly label: string;
  readonly category?: TokenCategory;
}

/** Reads the active block's value for a style property in the current bucket. */
type StyleGetter = (property: string) => StyleValue | undefined;
/** Curried writer: pick a property, then set (or clear with `null`) its value. */
type StyleSetter = (property: string) => (value: StyleValue | null) => void;

const SECTIONS: readonly {
  readonly id: string;
  readonly label: string;
  readonly controls: readonly ControlSpec[];
}[] = [
  {
    id: "typography",
    label: "Typography",
    controls: [
      { property: "color", label: "Text color", category: "colors" },
      // Only font-family draws from the typography tokens (the theme's named
      // font presets). Size/weight/line-height have no token scale, so they're
      // custom-only — otherwise they'd wrongly offer font-family names.
      { property: "fontFamily", label: "Font family", category: "typography" },
      { property: "fontSize", label: "Font size" },
      { property: "fontWeight", label: "Font weight" },
      { property: "lineHeight", label: "Line height" },
    ],
  },
  {
    id: "background",
    label: "Background",
    controls: [
      { property: "background", label: "Background", category: "colors" },
    ],
  },
  {
    id: "border",
    label: "Border",
    controls: [
      { property: "borderWidth", label: "Width", category: "border" },
      { property: "borderColor", label: "Color", category: "colors" },
      { property: "borderRadius", label: "Radius", category: "radius" },
    ],
  },
  {
    id: "effects",
    label: "Shadow",
    controls: [{ property: "boxShadow", label: "Shadow", category: "shadow" }],
  },
];

const SECTION_IDS = [...SECTIONS.map((s) => s.id), "spacing"];

/**
 * Right-rail Styles tab: collapsible sections of token-or-custom controls plus a
 * visual box-model for per-side spacing. Every edit targets the active device's
 * responsive bucket, so styles are set per breakpoint.
 */
export function StylesTab({ tokens }: StylesTabProps): ReactElement {
  const activeId = useEditorStore((s) => s.activeId);
  const device = useEditorStore((s) => s.device);
  const block = useEditorStore((s) =>
    s.activeId ? findBlock(s.tree, s.activeId) : null,
  );
  const updateBlockStyle = useEditorStore((s) => s.updateBlockStyle);

  if (!activeId || !block) {
    return (
      <p
        className="text-muted-foreground p-4 text-sm"
        data-testid="styles-tab-empty"
      >
        <Trans id="editor.styles.empty" message="Select a block to style it." />
      </p>
    );
  }

  const bucket: StyleBucket = deviceBucket(device);
  const current = block.style?.[bucket];
  const valueOf = (property: string): StyleValue | undefined =>
    normalizeStyleValue(current?.[property]) ?? undefined;
  const setter =
    (property: string) =>
    (value: StyleValue | null): void =>
      updateBlockStyle(activeId, bucket, property, value);

  return (
    <div className="flex flex-col gap-2 p-3" data-testid="styles-tab">
      <p
        className="text-muted-foreground text-xs"
        data-testid="styles-tab-scope"
      >
        <Trans id="editor.styles.scope" message="Editing" /> · {device}
      </p>
      <Accordion type="multiple" defaultValue={SECTION_IDS}>
        {SECTIONS.map((section) => (
          <AccordionItem key={section.id} value={section.id}>
            <AccordionTrigger data-testid={`styles-section-${section.id}`}>
              {section.label}
            </AccordionTrigger>
            <AccordionContent className="flex flex-col gap-3">
              {section.controls.map((c) => (
                <StyleControl
                  key={c.property}
                  label={c.label}
                  property={c.property}
                  category={c.category}
                  value={valueOf(c.property)}
                  tokens={tokens}
                  onChange={setter(c.property)}
                />
              ))}
              {section.id === "typography" && (
                <TextStyleControls valueOf={valueOf} setter={setter} />
              )}
            </AccordionContent>
          </AccordionItem>
        ))}
        <AccordionItem value="spacing">
          <AccordionTrigger data-testid="styles-section-spacing">
            <Trans id="editor.styles.spacing" message="Spacing" />
          </AccordionTrigger>
          <AccordionContent>
            <SpacingControls
              tokens={tokens}
              valueOf={valueOf}
              setter={setter}
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

// Toggle marks write a fixed raw value to one CSS property; underline and
// strikethrough share `text-decoration`, so they're mutually exclusive. Bold
// shares `font-weight` with the weight control as a quick shortcut.
const TEXT_MARKS = [
  { id: "bold", property: "fontWeight", on: "bold", Icon: Bold, label: "Bold" },
  {
    id: "italic",
    property: "fontStyle",
    on: "italic",
    Icon: Italic,
    label: "Italic",
  },
  {
    id: "underline",
    property: "textDecoration",
    on: "underline",
    Icon: Underline,
    label: "Underline",
  },
  {
    id: "strikethrough",
    property: "textDecoration",
    on: "line-through",
    Icon: Strikethrough,
    label: "Strikethrough",
  },
] as const;

const TEXT_ALIGNMENTS = [
  { value: "left", Icon: AlignLeft, label: "Align left" },
  { value: "center", Icon: AlignCenter, label: "Align center" },
  { value: "right", Icon: AlignRight, label: "Align right" },
] as const;

/** Bold/italic/underline/strikethrough marks and a text-align switch. Each
 *  writes a raw value to its CSS property (no token form). */
function TextStyleControls({
  valueOf,
  setter,
}: {
  readonly valueOf: StyleGetter;
  readonly setter: StyleSetter;
}): ReactElement {
  const { i18n } = useLingui();
  const rawValue = (property: string): string | undefined => {
    const value = valueOf(property);
    return value && "raw" in value ? value.raw : undefined;
  };

  return (
    <div
      className="flex items-center justify-between gap-1"
      data-testid="style-text-controls"
    >
      <div className="flex items-center gap-0.5">
        {TEXT_MARKS.map((mark) => (
          <Toggle
            key={mark.id}
            size="sm"
            variant="outline"
            pressed={rawValue(mark.property) === mark.on}
            data-testid={`style-mark-${mark.id}`}
            aria-label={i18n._({
              id: `editor.styles.mark.${mark.id}`,
              message: mark.label,
            })}
            onPressedChange={(next) =>
              setter(mark.property)(next ? { raw: mark.on } : null)
            }
          >
            <mark.Icon />
          </Toggle>
        ))}
      </div>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={rawValue("textAlign") ?? ""}
        onValueChange={(value) =>
          setter("textAlign")(value ? { raw: value } : null)
        }
      >
        {TEXT_ALIGNMENTS.map(({ value, Icon, label }) => (
          <ToggleGroupItem
            key={value}
            value={value}
            data-testid={`style-align-${value}`}
            aria-label={i18n._({
              id: `editor.styles.align.${value}`,
              message: label,
            })}
          >
            <Icon />
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

const SIDES = ["Top", "Right", "Bottom", "Left"] as const;

const SPACING_GROUPS = [
  {
    prefix: "margin",
    testId: "box-model-margin",
    label: <Trans id="editor.styles.margin" message="Margin" />,
  },
  {
    prefix: "padding",
    testId: "box-model-padding",
    label: <Trans id="editor.styles.padding" message="Padding" />,
  },
] as const;

/** Margin and padding, each its own card of per-side token-or-custom controls. */
function SpacingControls({
  tokens,
  valueOf,
  setter,
}: {
  readonly tokens: ThemeTokens;
  readonly valueOf: StyleGetter;
  readonly setter: StyleSetter;
}): ReactElement {
  return (
    <div className="flex flex-col gap-3">
      {SPACING_GROUPS.map((group) => (
        <div
          key={group.prefix}
          className="border-border flex flex-col gap-2 rounded-md border p-2"
          data-testid={group.testId}
        >
          <span className="text-muted-foreground text-xs">{group.label}</span>
          {SIDES.map((side) => {
            const property = `${group.prefix}${side}`;
            return (
              <StyleControl
                key={property}
                label={side}
                property={property}
                category="spacing"
                value={valueOf(property)}
                tokens={tokens}
                onChange={setter(property)}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
