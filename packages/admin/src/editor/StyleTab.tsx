import type { MessageDescriptor } from "@lingui/core";
import type { ComponentData } from "@puckeditor/core";
import type { ReactElement, ReactNode } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion.js";
import { useLabel } from "@/lib/use-label.js";
import { defineMessage } from "@lingui/core/macro";
import { Trans } from "@lingui/react";

import type {
  ResponsiveStyleSlot,
  ThemeTokenGroup,
  ThemeTokens,
} from "@plumix/blocks";

import type { StyleBucket } from "./viewport-bucket.js";
import { DEVICE_LABEL } from "./device-labels.js";
import { setStyleProperty } from "./style-edit.js";
import { TokenSwatchList } from "./TokenSwatchList.js";

type StyleProperty = "background" | "color" | "fontSize" | "padding";

interface StyleTabProps {
  readonly tokens: ThemeTokens;
  readonly selectedItem: ComponentData | null;
  readonly bucket: StyleBucket;
  readonly onStyleChange: (nextStyle: ResponsiveStyleSlot | undefined) => void;
}

const M = {
  background: defineMessage({
    id: "editor.styleTab.section.background",
    message: "Background",
  }),
  textColor: defineMessage({
    id: "editor.styleTab.section.textColor",
    message: "Text color",
  }),
  fontSize: defineMessage({
    id: "editor.styleTab.section.fontSize",
    message: "Font size",
  }),
  padding: defineMessage({
    id: "editor.styleTab.section.padding",
    message: "Padding",
  }),
} satisfies Record<string, MessageDescriptor>;

const SECTION_VALUES = ["background", "color", "fontSize", "padding"] as const;

export function StyleTab({
  tokens,
  selectedItem,
  bucket,
  onStyleChange,
}: StyleTabProps): ReactElement {
  const renderLabel = useLabel();
  if (!selectedItem) {
    return (
      <div
        className="text-muted-foreground p-4 text-sm"
        data-testid="style-tab-empty"
      >
        <Trans id="editor.styleTab.empty" message="Select a block to style." />
      </div>
    );
  }

  const style = selectedItem.props.style as ResponsiveStyleSlot | undefined;
  const writeProperty = (
    property: StyleProperty,
    tokenId: string | undefined,
  ): void => {
    onStyleChange(setStyleProperty(style, bucket, property, tokenId));
  };

  return (
    <div className="space-y-4 p-3" data-testid="style-tab">
      <div
        className="bg-muted rounded px-2 py-1 text-xs"
        data-testid="style-tab-active-bucket"
      >
        <Trans
          id="editor.styleTab.activeBucket"
          message="Editing for: {device}"
          values={{ device: renderLabel(DEVICE_LABEL[bucket]) }}
          comment="device: pre-resolved viewport label like 'Desktop', 'Tablet', 'Mobile'"
        />
      </div>
      <Accordion type="multiple" defaultValue={[...SECTION_VALUES]}>
        <SwatchSection
          heading={renderLabel(M.background)}
          property="background"
          tokens={tokens.colors}
          activeToken={style?.[bucket]?.background ?? ""}
          onWrite={writeProperty}
        />
        <SwatchSection
          heading={renderLabel(M.textColor)}
          property="color"
          tokens={tokens.colors}
          activeToken={style?.[bucket]?.color ?? ""}
          onWrite={writeProperty}
        />
        <SelectSection
          heading={renderLabel(M.fontSize)}
          property="fontSize"
          tokens={tokens.typography}
          activeToken={style?.[bucket]?.fontSize ?? ""}
          onWrite={writeProperty}
        />
        <SelectSection
          heading={renderLabel(M.padding)}
          property="padding"
          tokens={tokens.spacing}
          activeToken={style?.[bucket]?.padding ?? ""}
          onWrite={writeProperty}
        />
      </Accordion>
    </div>
  );
}

interface SectionProps {
  readonly heading: string;
  readonly property: StyleProperty;
  readonly tokens: ThemeTokenGroup | undefined;
  readonly activeToken: string;
  readonly onWrite: (
    property: StyleProperty,
    tokenId: string | undefined,
  ) => void;
}

interface CollapsibleSectionProps {
  readonly property: StyleProperty;
  readonly heading: string;
  readonly children: ReactNode;
}

function CollapsibleSection({
  property,
  heading,
  children,
}: CollapsibleSectionProps): ReactElement {
  return (
    <AccordionItem
      value={property}
      data-testid={`style-tab-section-${property}`}
    >
      <AccordionTrigger data-testid={`style-tab-section-${property}-trigger`}>
        {heading}
      </AccordionTrigger>
      <AccordionContent>{children}</AccordionContent>
    </AccordionItem>
  );
}

function SwatchSection({
  heading,
  property,
  tokens,
  activeToken,
  onWrite,
}: SectionProps): ReactElement | null {
  if (!tokens) return null;
  return (
    <CollapsibleSection property={property} heading={heading}>
      <TokenSwatchList
        tokens={tokens}
        value={activeToken}
        onChange={(next) => onWrite(property, next)}
        testIdPrefix={`style-tab-${property}`}
        ariaLabel={heading}
      />
    </CollapsibleSection>
  );
}

function SelectSection({
  heading,
  property,
  tokens,
  activeToken,
  onWrite,
}: SectionProps): ReactElement | null {
  if (!tokens) return null;
  return (
    <CollapsibleSection property={property} heading={heading}>
      <select
        value={activeToken}
        onChange={(event) =>
          onWrite(
            property,
            event.target.value === "" ? undefined : event.target.value,
          )
        }
        className="w-full rounded border px-2 py-1 text-sm"
        data-testid={`style-tab-${property}-select`}
      >
        <option value="">
          <Trans id="editor.styleTab.select.none" message="None" />
        </option>
        {Object.entries(tokens).map(([id, entry]) => (
          <option key={id} value={id}>
            {entry.label ?? id}
          </option>
        ))}
      </select>
    </CollapsibleSection>
  );
}
