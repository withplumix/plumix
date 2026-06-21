import type { ReactElement } from "react";
import { Trans } from "@lingui/react";

import type { StyleValue, ThemeTokens, TokenCategory } from "@plumix/blocks";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@plumix/admin-ui/accordion";
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
      { property: "fontSize", label: "Font size", category: "typography" },
      { property: "fontWeight", label: "Font weight", category: "typography" },
      { property: "lineHeight", label: "Line height", category: "typography" },
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
            </AccordionContent>
          </AccordionItem>
        ))}
        <AccordionItem value="spacing">
          <AccordionTrigger data-testid="styles-section-spacing">
            <Trans id="editor.styles.spacing" message="Spacing" />
          </AccordionTrigger>
          <AccordionContent>
            <BoxModelControl
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

const SIDES = ["Top", "Right", "Bottom", "Left"] as const;

/** Visual box-model: a margin box wrapping a padding box, each with per-side
 *  token-or-custom controls. */
function BoxModelControl({
  tokens,
  valueOf,
  setter,
}: {
  readonly tokens: ThemeTokens;
  readonly valueOf: (property: string) => StyleValue | undefined;
  readonly setter: (property: string) => (value: StyleValue | null) => void;
}): ReactElement {
  const sideControls = (prefix: "margin" | "padding"): ReactElement[] =>
    SIDES.map((side) => {
      const property = `${prefix}${side}`;
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
    });

  return (
    <div
      className="border-border flex flex-col gap-2 rounded-md border p-2"
      data-testid="box-model-margin"
    >
      <span className="text-muted-foreground text-xs">
        <Trans id="editor.styles.margin" message="Margin" />
      </span>
      {sideControls("margin")}
      <div
        className="border-border mt-1 flex flex-col gap-2 rounded-md border p-2"
        data-testid="box-model-padding"
      >
        <span className="text-muted-foreground text-xs">
          <Trans id="editor.styles.padding" message="Padding" />
        </span>
        {sideControls("padding")}
      </div>
    </div>
  );
}
