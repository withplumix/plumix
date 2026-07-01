import type { I18n } from "@lingui/core";
import type { ReactElement, ReactNode } from "react";
import { Trans, useLingui } from "@lingui/react";

import type { ThemeTokens, TokenCategory } from "@plumix/blocks";
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
  Eye,
  EyeOff,
  Italic,
  Strikethrough,
  Underline,
} from "@plumix/admin-ui/icons";
import { Toggle } from "@plumix/admin-ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@plumix/admin-ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@plumix/admin-ui/tooltip";
import { normalizeStyleValue } from "@plumix/blocks";

import type { StyleBucket } from "./store.js";
import type { StyleDeclaration } from "./style-declarations.js";
import { findBlock } from "./block-tree-ops.js";
import { useEditorStore } from "./provider.js";
import { deviceBucket } from "./store.js";
import { StyleControl } from "./style-control.js";
import { StyleDeclarations } from "./style-declarations.js";

interface StylesTabProps {
  readonly tokens: ThemeTokens;
}

interface ControlSpec {
  readonly property: string;
  readonly label: string;
  readonly category?: TokenCategory;
}

/** Reads the active block's value for a style property in the current bucket. */
type StyleGetter = (property: string) => string | undefined;
/** Curried writer: pick a property, then set (or clear with `null`) its value. */
type StyleSetter = (property: string) => (value: string | null) => void;

const SECTIONS: readonly {
  readonly id: string;
  readonly label: string;
  readonly controls: readonly ControlSpec[];
}[] = [
  {
    // Sizing has no token scale (widths are arbitrary px/%/rem), so these are
    // custom-only — same model as font-size.
    id: "size",
    label: "Size",
    controls: [
      { property: "width", label: "Width" },
      { property: "height", label: "Height" },
      { property: "minWidth", label: "Min width" },
      { property: "minHeight", label: "Min height" },
      { property: "maxWidth", label: "Max width" },
      { property: "maxHeight", label: "Max height" },
    ],
  },
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

// The visual sections open by default; the raw-CSS "declarations" section is a
// dev-facing escape hatch, so it starts collapsed.
const SECTION_IDS = [...SECTIONS.map((s) => s.id), "spacing"];

/**
 * Right-rail Styles tab: collapsible sections of token-or-custom controls plus a
 * visual box-model for per-side spacing. Every edit targets the active device's
 * responsive bucket, so styles are set per breakpoint.
 */
export function StylesTab({ tokens }: StylesTabProps): ReactElement {
  const { i18n } = useLingui();
  const activeId = useEditorStore((s) => s.activeId);
  const device = useEditorStore((s) => s.device);
  const block = useEditorStore((s) =>
    s.activeId ? findBlock(s.tree, s.activeId) : null,
  );
  const updateBlockStyle = useEditorStore((s) => s.updateBlockStyle);
  const renameBlockStyleProperty = useEditorStore(
    (s) => s.renameBlockStyleProperty,
  );

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
  const valueOf = (property: string): string | undefined =>
    normalizeStyleValue(current?.[property]) ?? undefined;
  // Keep every string entry — including an empty one mid-retype — so clearing a
  // value doesn't unmount its row. Emission drops empties at sanitize time.
  const declarations: StyleDeclaration[] = Object.entries(
    current ?? {},
  ).flatMap(([property, stored]) =>
    typeof stored === "string" ? [{ property, value: stored }] : [],
  );
  const setter =
    (property: string) =>
    (value: string | null): void =>
      updateBlockStyle(activeId, bucket, property, value);
  // Hidden when display is set to "none" for this device.
  const hidden = valueOf("display") === "none";

  return (
    <div className="flex flex-col gap-2 p-3" data-testid="styles-tab">
      <div className="flex items-center justify-between">
        <p
          className="text-muted-foreground text-xs"
          data-testid="styles-tab-scope"
        >
          <Trans id="editor.styles.scope" message="Editing" /> · {device}
        </p>
        {/* Writes display:none into the active device's bucket only. */}
        <Toggle
          variant="outline"
          size="sm"
          pressed={hidden}
          onPressedChange={(next) => setter("display")(next ? "none" : null)}
          data-testid="style-hide-on-device"
          aria-label={i18n._({
            id: "editor.styles.hideOnDevice",
            message: "Hide on this device",
          })}
        >
          {hidden ? <EyeOff /> : <Eye />}
        </Toggle>
      </div>
      <Accordion type="multiple" defaultValue={SECTION_IDS}>
        {SECTIONS.map((section) => (
          <AccordionItem key={section.id} value={section.id}>
            <AccordionTrigger data-testid={`styles-section-${section.id}`}>
              {section.label}
            </AccordionTrigger>
            <AccordionContent className="flex flex-col gap-3">
              {/* Two-per-row so the rail stays compact; each StyleControl is a
                  self-contained cell (label + input stacked). */}
              <div className="grid grid-cols-2 gap-x-2 gap-y-3">
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
              </div>
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
        <AccordionItem value="declarations">
          <AccordionTrigger data-testid="styles-section-declarations">
            <Trans id="editor.styles.css" message="CSS" />
          </AccordionTrigger>
          <AccordionContent>
            <StyleDeclarations
              declarations={declarations}
              tokens={tokens}
              onChange={(property, value) => setter(property)(value)}
              onRename={(from, to) =>
                renameBlockStyleProperty(activeId, bucket, from, to)
              }
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

/** A tooltipped toggle item. `px-2` tightens the item's hardcoded px-3 so all
 *  seven text controls fit the narrow rail without overflowing. */
function TooltipToggleItem({
  value,
  testid,
  label,
  children,
}: {
  readonly value: string;
  readonly testid: string;
  readonly label: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <ToggleGroupItem
          value={value}
          data-testid={testid}
          aria-label={label}
          className="px-2"
        >
          {children}
        </ToggleGroupItem>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

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

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className="flex items-center justify-between gap-1"
        data-testid="style-text-controls"
      >
        <ToggleGroup
          type="multiple"
          variant="outline"
          size="sm"
          value={TEXT_MARKS.filter((m) => valueOf(m.property) === m.on).map(
            (m) => m.id,
          )}
          onValueChange={(next) => {
            // Radix hands back the full pressed set; write only the mark whose
            // state flipped (exactly one per click).
            for (const mark of TEXT_MARKS) {
              const on = valueOf(mark.property) === mark.on;
              const wantOn = next.includes(mark.id);
              if (on !== wantOn) {
                setter(mark.property)(wantOn ? mark.on : null);
              }
            }
          }}
        >
          {TEXT_MARKS.map((mark) => (
            <TooltipToggleItem
              key={mark.id}
              value={mark.id}
              testid={`style-mark-${mark.id}`}
              label={markLabel(i18n, mark.id)}
            >
              <mark.Icon />
            </TooltipToggleItem>
          ))}
        </ToggleGroup>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={valueOf("textAlign") ?? ""}
          onValueChange={(value) => setter("textAlign")(value || null)}
        >
          {TEXT_ALIGNMENTS.map(({ value, Icon }) => (
            <TooltipToggleItem
              key={value}
              value={value}
              testid={`style-align-${value}`}
              label={alignLabel(i18n, value)}
            >
              <Icon />
            </TooltipToggleItem>
          ))}
        </ToggleGroup>
      </div>
    </TooltipProvider>
  );
}

// Static ids (a switch, not a template literal) so the extractor catalogs them.
function markLabel(i18n: I18n, id: string): string {
  switch (id) {
    case "italic":
      return i18n._({ id: "editor.styles.mark.italic", message: "Italic" });
    case "underline":
      return i18n._({
        id: "editor.styles.mark.underline",
        message: "Underline",
      });
    case "strikethrough":
      return i18n._({
        id: "editor.styles.mark.strikethrough",
        message: "Strikethrough",
      });
    default:
      return i18n._({ id: "editor.styles.mark.bold", message: "Bold" });
  }
}

function alignLabel(i18n: I18n, value: string): string {
  switch (value) {
    case "center":
      return i18n._({
        id: "editor.styles.align.center",
        message: "Align center",
      });
    case "right":
      return i18n._({
        id: "editor.styles.align.right",
        message: "Align right",
      });
    default:
      return i18n._({ id: "editor.styles.align.left", message: "Align left" });
  }
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
          <div className="grid grid-cols-2 gap-x-2 gap-y-2">
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
        </div>
      ))}
    </div>
  );
}
