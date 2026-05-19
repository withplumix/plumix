import type {
  ResponsiveStyleSlot,
  ThemeTokenGroup,
  ThemeTokens,
} from "@plumix/blocks";
import type { ReactElement, ReactNode } from "react";
import type { ComponentData } from "@puckeditor/core";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion.js";

import { setStyleProperty } from "./style-edit.js";
import { TokenSwatchList } from "./TokenSwatchList.js";
import type { StyleBucket } from "./viewport-bucket.js";

type StyleProperty = "background" | "color" | "fontSize" | "padding";

interface StyleTabProps {
  readonly tokens: ThemeTokens;
  readonly selectedItem: ComponentData | null;
  readonly bucket: StyleBucket;
  readonly onStyleChange: (nextStyle: ResponsiveStyleSlot | undefined) => void;
}

const BUCKET_LABEL: Readonly<Record<StyleBucket, string>> = {
  small: "Mobile",
  medium: "Tablet",
  large: "Desktop",
};

const SECTION_VALUES = ["background", "color", "fontSize", "padding"] as const;

export function StyleTab({
  tokens,
  selectedItem,
  bucket,
  onStyleChange,
}: StyleTabProps): ReactElement {
  if (!selectedItem) {
    return (
      <div
        className="p-4 text-sm text-muted-foreground"
        data-testid="style-tab-empty"
      >
        Select a block to style.
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
        className="rounded bg-muted px-2 py-1 text-xs"
        data-testid="style-tab-active-bucket"
      >
        Editing for: {BUCKET_LABEL[bucket]}
      </div>
      <Accordion type="multiple" defaultValue={[...SECTION_VALUES]}>
        <SwatchSection
          heading="Background"
          property="background"
          tokens={tokens.colors}
          activeToken={style?.[bucket]?.background ?? ""}
          onWrite={writeProperty}
        />
        <SwatchSection
          heading="Text color"
          property="color"
          tokens={tokens.colors}
          activeToken={style?.[bucket]?.color ?? ""}
          onWrite={writeProperty}
        />
        <SelectSection
          heading="Font size"
          property="fontSize"
          tokens={tokens.typography}
          activeToken={style?.[bucket]?.fontSize ?? ""}
          onWrite={writeProperty}
        />
        <SelectSection
          heading="Padding"
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
  readonly onWrite: (property: StyleProperty, tokenId: string | undefined) => void;
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
      <AccordionTrigger
        data-testid={`style-tab-section-${property}-trigger`}
      >
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
          onWrite(property, event.target.value === "" ? undefined : event.target.value)
        }
        className="w-full rounded border px-2 py-1 text-sm"
        data-testid={`style-tab-${property}-select`}
      >
        <option value="">None</option>
        {Object.entries(tokens).map(([id, entry]) => (
          <option key={id} value={id}>
            {entry.label ?? id}
          </option>
        ))}
      </select>
    </CollapsibleSection>
  );
}
