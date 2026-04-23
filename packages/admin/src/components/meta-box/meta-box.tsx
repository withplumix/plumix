import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.js";

import type { EntryMetaBoxManifestEntry } from "@plumix/core/manifest";

import { MetaBoxField } from "./meta-box-field.js";

// Single meta-box renderer — uniform shape regardless of the registered
// `context` ("side" / "normal" / "advanced"). Parent layout decides
// placement; this component just renders the box itself.
export function MetaBox({
  box,
  values,
  onChange,
  disabled = false,
}: {
  readonly box: EntryMetaBoxManifestEntry;
  readonly values: Readonly<Record<string, unknown>>;
  readonly onChange: (key: string, value: unknown) => void;
  readonly disabled?: boolean;
}): ReactNode {
  return (
    <Card data-testid={`meta-box-${box.id}`}>
      <CardHeader>
        <CardTitle>{box.label}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {box.fields.map((field) => (
          <MetaBoxField
            key={field.key}
            field={field}
            value={values[field.key]}
            disabled={disabled}
            onChange={(next) => {
              onChange(field.key, next);
            }}
          />
        ))}
      </CardContent>
    </Card>
  );
}
