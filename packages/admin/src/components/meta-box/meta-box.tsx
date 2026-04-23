import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.js";

import type { MetaBoxBaseManifestEntry } from "@plumix/core/manifest";

import { MetaBoxField } from "./meta-box-field.js";

/**
 * Shared stateless renderer for every meta-box surface (entry / term /
 * user). Parent owns the `values` state and carries the bag on the
 * entity's single Save — this component just draws the Card. Settings
 * groups have their own per-card save model and render with the
 * `<SettingsGroupCard>` path instead.
 *
 * Accepts any meta-box manifest entry (they all share the base shape:
 * `id`, `label`, `description?`, `fields`), so the entry editor,
 * taxonomy edit route, and user edit route all pass through the same
 * component.
 */
export function MetaBoxCard({
  box,
  values,
  onChange,
  disabled = false,
}: {
  readonly box: MetaBoxBaseManifestEntry & { readonly id: string };
  readonly values: Readonly<Record<string, unknown>>;
  readonly onChange: (key: string, value: unknown) => void;
  readonly disabled?: boolean;
}): ReactNode {
  return (
    <Card data-testid={`meta-box-${box.id}`}>
      <CardHeader>
        <CardTitle>
          <h2
            className="text-lg font-semibold"
            data-testid={`meta-box-heading-${box.id}`}
          >
            {box.label}
          </h2>
        </CardTitle>
        {box.description ? (
          <CardDescription>{box.description}</CardDescription>
        ) : null}
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
