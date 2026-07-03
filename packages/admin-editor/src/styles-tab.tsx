import type { I18n } from "@lingui/core";
import type { ReactElement, ReactNode } from "react";
import { Trans, useLingui } from "@lingui/react";

import type {
  ResponsiveStyleSlot,
  ThemeTokens,
  TokenCategory,
} from "@plumix/blocks";
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
import { Input } from "@plumix/admin-ui/input";
import { Label } from "@plumix/admin-ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@plumix/admin-ui/select";
import { Slider } from "@plumix/admin-ui/slider";
import { Switch } from "@plumix/admin-ui/switch";
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
import { HEX6, StyleControl } from "./style-control.js";
import { StyleDeclarations } from "./style-declarations.js";

interface StylesTabProps {
  readonly tokens: ThemeTokens;
}

interface ControlSpec {
  readonly property: string;
  readonly label: string;
  readonly category?: TokenCategory;
  /** Enumerated CSS keywords rendered as a Select (e.g. border-style). When
   *  set, the control is a plain keyword picker — no token/custom modes. */
  readonly options?: readonly string[];
}

/** Reads the active block's value for a style property in the current bucket. */
type StyleGetter = (property: string) => string | undefined;
/** Curried writer: pick a property, then set (or clear with `null`) its value. */
type StyleSetter = (property: string) => (value: string | null) => void;

// Sizing has no token scale (widths are arbitrary px/%/rem), so these are
// custom-only — same model as font-size. Folded into the Layout section (like
// Builder), not a standalone section.
const SIZE_CONTROLS: readonly ControlSpec[] = [
  { property: "width", label: "Width" },
  { property: "height", label: "Height" },
  { property: "minWidth", label: "Min width" },
  { property: "minHeight", label: "Min height" },
  { property: "maxWidth", label: "Max width" },
  { property: "maxHeight", label: "Max height" },
];

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
      { property: "letterSpacing", label: "Letter spacing" },
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
      {
        property: "borderStyle",
        label: "Style",
        options: ["none", "solid", "dashed", "dotted", "double"],
      },
      { property: "borderWidth", label: "Width", category: "border" },
      { property: "borderColor", label: "Color", category: "colors" },
      { property: "borderRadius", label: "Radius", category: "radius" },
    ],
  },
];

// The visual sections open by default; the raw-CSS "declarations" section is a
// dev-facing escape hatch, so it starts collapsed.
const SECTION_IDS = [
  "layout",
  "visibility",
  ...SECTIONS.map((s) => s.id),
  "effects",
  "spacing",
];

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
  // Visibility writes display:none per device bucket directly (not via the
  // active-device `setter`), so all three breakpoints are editable at once.
  const setHiddenOn = (target: StyleBucket, hidden: boolean): void =>
    updateBlockStyle(activeId, target, "display", hidden ? "none" : null);

  return (
    <div className="flex flex-col gap-2 p-3" data-testid="styles-tab">
      <p
        className="text-muted-foreground text-xs"
        data-testid="styles-tab-scope"
      >
        <Trans id="editor.styles.scope" message="Editing" /> · {device}
      </p>
      <Accordion type="multiple" defaultValue={SECTION_IDS}>
        <AccordionItem value="layout">
          <AccordionTrigger data-testid="styles-section-layout">
            Layout
          </AccordionTrigger>
          <AccordionContent>
            <LayoutControls valueOf={valueOf} setter={setter} tokens={tokens} />
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="visibility">
          <AccordionTrigger data-testid="styles-section-visibility">
            <Trans id="editor.styles.visibility" message="Visibility" />
          </AccordionTrigger>
          <AccordionContent>
            <VisibilityControls style={block.style} onToggle={setHiddenOn} />
          </AccordionContent>
        </AccordionItem>
        {SECTIONS.map((section) => (
          <AccordionItem key={section.id} value={section.id}>
            <AccordionTrigger data-testid={`styles-section-${section.id}`}>
              {section.label}
            </AccordionTrigger>
            <AccordionContent className="flex flex-col gap-3">
              {/* Two-per-row so the rail stays compact; each StyleControl is a
                  self-contained cell (label + input stacked). */}
              <div className="grid grid-cols-2 gap-x-2 gap-y-3">
                {section.controls.map((c) =>
                  c.options ? (
                    <KeywordControl
                      key={c.property}
                      label={c.label}
                      property={c.property}
                      options={c.options}
                      value={valueOf(c.property)}
                      onChange={setter(c.property)}
                    />
                  ) : (
                    <StyleControl
                      key={c.property}
                      label={c.label}
                      property={c.property}
                      category={c.category}
                      value={valueOf(c.property)}
                      tokens={tokens}
                      onChange={setter(c.property)}
                    />
                  ),
                )}
              </div>
              {section.id === "typography" && (
                <TextStyleControls valueOf={valueOf} setter={setter} />
              )}
              {section.id === "background" && (
                <BackgroundImageControl
                  value={valueOf("backgroundImage")}
                  onChange={setter("backgroundImage")}
                />
              )}
            </AccordionContent>
          </AccordionItem>
        ))}
        <AccordionItem value="effects">
          <AccordionTrigger data-testid="styles-section-effects">
            <Trans id="editor.styles.effects" message="Shadows & Effects" />
          </AccordionTrigger>
          <AccordionContent className="flex flex-col gap-3">
            <ShadowsEffectsControls
              tokens={tokens}
              valueOf={valueOf}
              setter={setter}
            />
          </AccordionContent>
        </AccordionItem>
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

// Each device maps to the responsive bucket its @media narrows to. The Switch is
// `htmlFor`-associated with its translated Label, so the label doubles as the
// accessible name and clicking it toggles (Builder's click-anywhere rows).
const VISIBILITY_DEVICES: readonly {
  readonly id: string;
  readonly bucket: StyleBucket;
  readonly label: ReactElement;
}[] = [
  {
    id: "desktop",
    bucket: "large",
    label: (
      <Trans id="editor.styles.visibility.desktop" message="Hide on desktop" />
    ),
  },
  {
    id: "tablet",
    bucket: "medium",
    label: (
      <Trans id="editor.styles.visibility.tablet" message="Hide on tablet" />
    ),
  },
  {
    id: "mobile",
    bucket: "small",
    label: (
      <Trans id="editor.styles.visibility.mobile" message="Hide on mobile" />
    ),
  },
];

/** Per-device hide switches — writes display:none into each device's bucket
 *  independently, so all three breakpoints are visible/editable at once
 *  (Builder's Visibility panel). */
function VisibilityControls({
  style,
  onToggle,
}: {
  readonly style: ResponsiveStyleSlot | undefined;
  readonly onToggle: (bucket: StyleBucket, hidden: boolean) => void;
}): ReactElement {
  return (
    <div
      className="flex flex-col gap-3"
      data-testid="style-visibility-controls"
    >
      {VISIBILITY_DEVICES.map((device) => {
        const hidden =
          normalizeStyleValue(style?.[device.bucket]?.display) === "none";
        return (
          <div key={device.id} className="flex items-center justify-between">
            <Label htmlFor={`visibility-${device.id}`} className="text-xs">
              {device.label}
            </Label>
            <Switch
              id={`visibility-${device.id}`}
              checked={hidden}
              onCheckedChange={(on) => onToggle(device.bucket, on)}
              data-testid={`style-visibility-${device.id}`}
            />
          </div>
        );
      })}
    </div>
  );
}

const LAYOUT_LABELS: Readonly<Record<string, string>> = {
  block: "Block",
  flex: "Flex",
  grid: "Grid",
  row: "Row",
  column: "Column",
  "flex-start": "Start",
  center: "Center",
  "flex-end": "End",
  "space-between": "Between",
  stretch: "Stretch",
};

/** Style-bound layout controls (display / direction / gap / justify / align)
 *  written straight to the block's `node.style` — the unopinionated Box gets
 *  its layout here rather than from a block prop, like Builder's Box. */
function LayoutControls({
  valueOf,
  setter,
  tokens,
}: {
  readonly valueOf: StyleGetter;
  readonly setter: StyleSetter;
  readonly tokens: ThemeTokens;
}): ReactElement {
  const display = valueOf("display");
  const isFlex = display === "flex";
  return (
    <div className="flex flex-col gap-3" data-testid="style-layout-controls">
      <LayoutToggle
        label="Display"
        property="display"
        options={["block", "flex", "grid"]}
        valueOf={valueOf}
        setter={setter}
      />
      {isFlex ? (
        <LayoutToggle
          label="Direction"
          property="flexDirection"
          options={["row", "column"]}
          valueOf={valueOf}
          setter={setter}
        />
      ) : null}
      {isFlex || display === "grid" ? (
        <StyleControl
          label="Gap"
          property="gap"
          category="spacing"
          value={valueOf("gap")}
          tokens={tokens}
          onChange={setter("gap")}
        />
      ) : null}
      {isFlex ? (
        <>
          <LayoutToggle
            label="Justify"
            property="justifyContent"
            options={["flex-start", "center", "flex-end", "space-between"]}
            valueOf={valueOf}
            setter={setter}
          />
          <LayoutToggle
            label="Align"
            property="alignItems"
            options={["flex-start", "center", "flex-end", "stretch"]}
            valueOf={valueOf}
            setter={setter}
          />
        </>
      ) : null}
      {/* Self-alignment within the parent — Builder's "Align" row. Independent
          of this block's own display, so it's always offered. */}
      <LayoutToggle
        label="Align self"
        property="alignSelf"
        options={["flex-start", "center", "flex-end", "stretch"]}
        valueOf={valueOf}
        setter={setter}
      />
      {/* Sizing (width/height/min/max), folded in from the old Size section. */}
      <div className="grid grid-cols-2 gap-x-2 gap-y-3">
        {SIZE_CONTROLS.map((c) => (
          <StyleControl
            key={c.property}
            label={c.label}
            property={c.property}
            value={valueOf(c.property)}
            tokens={tokens}
            onChange={setter(c.property)}
          />
        ))}
      </div>
    </div>
  );
}

// Radix Select forbids an empty item value, so the "clear" choice carries a
// sentinel that maps back to `null` (property absent) on change.
const KEYWORD_NONE = "__unset__";

/** A labelled dropdown of enumerated CSS keywords (e.g. border-style). Writes
 *  the picked keyword to `property`; the leading "—" clears it. No token mode —
 *  these properties have no theme scale, only a fixed value set. */
function KeywordControl({
  label,
  property,
  options,
  value,
  onChange,
}: {
  readonly label: string;
  readonly property: string;
  readonly options: readonly string[];
  readonly value: string | undefined;
  readonly onChange: (value: string | null) => void;
}): ReactElement {
  const testId = `style-control-${property}`;
  return (
    <div className="flex flex-col gap-1" data-testid={testId}>
      <Label className="text-xs">{label}</Label>
      <Select
        value={value ?? KEYWORD_NONE}
        onValueChange={(next) => onChange(next === KEYWORD_NONE ? null : next)}
      >
        <SelectTrigger className="w-full" data-testid={`${testId}-select`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            value={KEYWORD_NONE}
            data-testid={`${testId}-option-unset`}
          >
            —
          </SelectItem>
          {options.map((opt) => (
            <SelectItem
              key={opt}
              value={opt}
              data-testid={`${testId}-option-${opt}`}
            >
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** One style-bound single-choice row: writes the picked CSS keyword to
 *  `property` in node.style, clears it when the active item is re-picked. */
function LayoutToggle({
  label,
  property,
  options,
  valueOf,
  setter,
}: {
  readonly label: string;
  readonly property: string;
  readonly options: readonly string[];
  readonly valueOf: StyleGetter;
  readonly setter: StyleSetter;
}): ReactElement {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs">{label}</Label>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={valueOf(property) ?? ""}
        onValueChange={(value) => setter(property)(value || null)}
      >
        {options.map((opt) => (
          <ToggleGroupItem
            key={opt}
            value={opt}
            data-testid={`style-${property}-${opt}`}
            className="text-xs"
          >
            {LAYOUT_LABELS[opt] ?? opt}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
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

// Unwraps `url("…")` to the bare URL for editing; tolerant of single/double/no
// quotes. A non-url() value (e.g. a gradient set via raw CSS) yields "" so the
// field stays empty rather than showing a form it can't represent.
function parseBackgroundImageUrl(value: string | undefined): string {
  const match = value?.match(/^url\((['"]?)(.*)\1\)$/);
  return match?.[2] ?? "";
}

/** A "Fill image" URL field composing `background-image: url("…")`. Kept a URL
 *  entry (not a media browser) — the media library isn't wired into the styles
 *  rail; a pasted/resolved URL is the minimum that reaches parity.
 *
 *  The value is stored verbatim; `sanitizeCssValue` at emit drops URLs carrying
 *  `@`, `;`, or a `data:` scheme (its breakout denylist), so those won't ship
 *  even though the field accepts them — an accepted limitation, not a guard. */
function BackgroundImageControl({
  value,
  onChange,
}: {
  readonly value: string | undefined;
  readonly onChange: (value: string | null) => void;
}): ReactElement {
  return (
    <div
      className="flex flex-col gap-1"
      data-testid="style-control-backgroundImage"
    >
      <Label className="text-xs">
        <Trans id="editor.styles.fillImage" message="Fill image" />
      </Label>
      <Input
        value={parseBackgroundImageUrl(value)}
        onChange={(e) => {
          const url = e.target.value.trim();
          onChange(url === "" ? null : `url("${url}")`);
        }}
        placeholder="https://…"
        data-testid="style-control-backgroundImage-url"
      />
    </div>
  );
}

/** Shadows & Effects: opacity plus a box-shadow token picker. Opacity leads,
 *  matching Builder's ordering. */
function ShadowsEffectsControls({
  tokens,
  valueOf,
  setter,
}: {
  readonly tokens: ThemeTokens;
  readonly valueOf: StyleGetter;
  readonly setter: StyleSetter;
}): ReactElement {
  return (
    <>
      <OpacityControl value={valueOf("opacity")} onChange={setter("opacity")} />
      <StyleControl
        label="Box shadow"
        property="boxShadow"
        category="shadow"
        value={valueOf("boxShadow")}
        tokens={tokens}
        onChange={setter("boxShadow")}
      />
      <TextShadowControls
        value={valueOf("textShadow")}
        onChange={setter("textShadow")}
      />
    </>
  );
}

// A text-shadow as its offset/blur/color parts. Enabling seeds a soft default;
// each field recomposes the whole `x y blur color` value.
const DEFAULT_TEXT_SHADOW = { x: "1", y: "1", blur: "3", color: "#000000" };

interface TextShadowParts {
  readonly x: string;
  readonly y: string;
  readonly blur: string;
  readonly color: string;
}

// Splits on whitespace and treats the 4th token as the color — a hex-only
// contract that matches the swatch below. A hand-authored space-separated color
// (e.g. `rgb(0 0 0)`) via the raw-CSS section wouldn't round-trip; the composer
// resets it to the default hex on the next edit.
function parseTextShadow(value: string | undefined): TextShadowParts {
  if (!value) return DEFAULT_TEXT_SHADOW;
  const parts = value.trim().split(/\s+/);
  const len = (raw: string | undefined, fallback: string): string =>
    raw ? raw.replace("px", "") : fallback;
  return {
    x: len(parts[0], DEFAULT_TEXT_SHADOW.x),
    y: len(parts[1], DEFAULT_TEXT_SHADOW.y),
    blur: len(parts[2], DEFAULT_TEXT_SHADOW.blur),
    color: parts[3] ?? DEFAULT_TEXT_SHADOW.color,
  };
}

function formatTextShadow(parts: TextShadowParts): string {
  return `${parts.x}px ${parts.y}px ${parts.blur}px ${parts.color}`;
}

/** A switch-gated text-shadow composer: color swatch plus X/Y/blur offsets.
 *  Off clears the property; on seeds a default then edits its parts in place. */
function TextShadowControls({
  value,
  onChange,
}: {
  readonly value: string | undefined;
  readonly onChange: (value: string | null) => void;
}): ReactElement {
  const enabled = value !== undefined;
  const parts = parseTextShadow(value);
  const setPart =
    (key: keyof TextShadowParts) =>
    (next: string): void =>
      onChange(formatTextShadow({ ...parts, [key]: next }));

  return (
    <div className="flex flex-col gap-2" data-testid="style-text-shadow">
      <div className="flex items-center justify-between">
        <Label className="text-xs">
          <Trans id="editor.styles.textShadow" message="Text shadow" />
        </Label>
        <Switch
          checked={enabled}
          onCheckedChange={(on) =>
            onChange(on ? formatTextShadow(DEFAULT_TEXT_SHADOW) : null)
          }
          data-testid="style-text-shadow-toggle"
          aria-label="Text shadow"
        />
      </div>
      {enabled ? (
        <div className="flex flex-col gap-2">
          <input
            type="color"
            value={HEX6.test(parts.color) ? parts.color : "#000000"}
            onChange={(e) => setPart("color")(e.target.value)}
            className="border-input h-8 w-full cursor-pointer rounded-md border bg-transparent p-1"
            data-testid="style-text-shadow-color"
            aria-label="Text shadow color"
          />
          <div className="grid grid-cols-3 gap-2">
            {(["x", "y", "blur"] as const).map((key) => (
              <div key={key} className="flex flex-col gap-1">
                <Label className="text-xs capitalize">{key}</Label>
                <Input
                  type="number"
                  value={parts[key]}
                  // Coalesce an emptied field to 0 so composition never emits a
                  // malformed `text-shadow` (e.g. "px 1px 3px …").
                  onChange={(e) => setPart(key)(e.target.value || "0")}
                  className="h-8"
                  data-testid={`style-text-shadow-${key}`}
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Opacity as a 0–1 slider paired with an editable numeric readout. The input
 *  is the canonical entry point (fully controllable); the slider mirrors it. An
 *  absent value reads as fully opaque (1) but leaves the property unset. */
function OpacityControl({
  value,
  onChange,
}: {
  readonly value: string | undefined;
  readonly onChange: (value: string | null) => void;
}): ReactElement {
  const parsed = value !== undefined ? Number(value) : 1;
  const slider = Number.isFinite(parsed) ? parsed : 1;
  return (
    <div className="flex flex-col gap-1" data-testid="style-control-opacity">
      <Label className="text-xs">
        <Trans id="editor.styles.opacity" message="Opacity" />
      </Label>
      <div className="flex items-center gap-2">
        <Slider
          min={0}
          max={1}
          step={0.05}
          value={[slider]}
          onValueChange={(values) => {
            const next = values[0];
            if (typeof next === "number") onChange(String(next));
          }}
          className="flex-1"
          data-testid="style-control-opacity-slider"
          aria-label="Opacity"
        />
        <Input
          type="number"
          min={0}
          max={1}
          step={0.1}
          value={value ?? ""}
          onChange={(e) =>
            onChange(e.target.value === "" ? null : e.target.value)
          }
          className="h-8 w-16"
          data-testid="style-control-opacity-input"
        />
      </div>
    </div>
  );
}

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
