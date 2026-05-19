import type { ResponsiveStyleSlot, ThemeTokens } from "@plumix/blocks";
import type { ChangeEvent, ReactElement } from "react";
import type { ComponentData } from "@puckeditor/core";

import { setStyleProperty } from "./style-edit.js";
import type { StyleBucket } from "./viewport-bucket.js";

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
  const padding = style?.[bucket]?.padding ?? "";
  const spacingTokens = Object.entries(tokens.spacing ?? {});

  const handlePaddingChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    const next = event.target.value === "" ? undefined : event.target.value;
    onStyleChange(setStyleProperty(style, bucket, "padding", next));
  };

  return (
    <div className="p-3" data-testid="style-tab">
      <div
        className="mb-3 rounded bg-muted px-2 py-1 text-xs"
        data-testid="style-tab-active-bucket"
      >
        Editing for: {BUCKET_LABEL[bucket]}
      </div>
      <section className="space-y-2" data-testid="style-tab-section-spacing">
        <h3 className="text-sm font-medium">Spacing</h3>
        <label className="flex flex-col gap-1 text-xs">
          <span>Padding</span>
          <select
            value={padding}
            onChange={handlePaddingChange}
            className="rounded border px-2 py-1 text-sm"
            data-testid="style-tab-padding-select"
          >
            <option value="">None</option>
            {spacingTokens.map(([id, entry]) => (
              <option key={id} value={id}>
                {entry.label ?? id}
              </option>
            ))}
          </select>
        </label>
      </section>
    </div>
  );
}
