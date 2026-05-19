import type {
  ResponsiveStyleSlot,
  ThemeTokenGroup,
  ThemeTokens,
} from "@plumix/blocks";
import type { ReactElement } from "react";
import type { ComponentData } from "@puckeditor/core";

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
      <SwatchSection
        heading="Background"
        testId="style-tab-section-background"
        property="background"
        tokens={tokens.colors}
        value={style?.[bucket]?.background ?? ""}
        onWrite={writeProperty}
      />
      <SwatchSection
        heading="Text color"
        testId="style-tab-section-color"
        property="color"
        tokens={tokens.colors}
        value={style?.[bucket]?.color ?? ""}
        onWrite={writeProperty}
      />
      <SelectSection
        heading="Font size"
        testId="style-tab-section-fontSize"
        property="fontSize"
        tokens={tokens.typography}
        value={style?.[bucket]?.fontSize ?? ""}
        onWrite={writeProperty}
      />
      <SelectSection
        heading="Padding"
        testId="style-tab-section-spacing"
        property="padding"
        tokens={tokens.spacing}
        value={style?.[bucket]?.padding ?? ""}
        onWrite={writeProperty}
      />
    </div>
  );
}

interface SectionProps {
  readonly heading: string;
  readonly testId: string;
  readonly property: StyleProperty;
  readonly tokens: ThemeTokenGroup | undefined;
  readonly value: string;
  readonly onWrite: (property: StyleProperty, tokenId: string | undefined) => void;
}

function SwatchSection({
  heading,
  testId,
  property,
  tokens,
  value,
  onWrite,
}: SectionProps): ReactElement | null {
  if (!tokens) return null;
  return (
    <section className="space-y-2" data-testid={testId}>
      <h3 className="text-sm font-medium">{heading}</h3>
      <TokenSwatchList
        tokens={tokens}
        value={value}
        onChange={(next) => onWrite(property, next)}
        testIdPrefix={`style-tab-${property}`}
        ariaLabel={heading}
      />
    </section>
  );
}

function SelectSection({
  heading,
  testId,
  property,
  tokens,
  value,
  onWrite,
}: SectionProps): ReactElement | null {
  if (!tokens) return null;
  return (
    <section className="space-y-2" data-testid={testId}>
      <h3 className="text-sm font-medium">{heading}</h3>
      <select
        value={value}
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
    </section>
  );
}
