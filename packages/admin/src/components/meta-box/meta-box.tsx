import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.js";

import type {
  EntryMetaBoxManifestEntry,
  TermMetaBoxManifestEntry,
  UserMetaBoxManifestEntry,
} from "@plumix/core/manifest";

import { MetaBoxField } from "./meta-box-field.js";

/**
 * Any entity-meta box we render with this component. Settings groups
 * deliberately don't pass through here — they use their own per-card
 * save model in `SettingsGroupCard`.
 */
export type MetaBoxCardEntry =
  | EntryMetaBoxManifestEntry
  | TermMetaBoxManifestEntry
  | UserMetaBoxManifestEntry;

/**
 * Shared stateless renderer for every entity-meta surface (entry /
 * term / user). Parent owns the `values` state and carries the bag on
 * the entity's single Save — this component just draws the Card.
 */
export function MetaBoxCard({
  box,
  values,
  onChange,
  disabled = false,
}: {
  readonly box: MetaBoxCardEntry;
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
