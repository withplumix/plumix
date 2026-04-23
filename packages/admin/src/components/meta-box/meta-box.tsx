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
import { metaBoxFieldColSpanClass } from "./meta-box-grid.js";

// Settings groups deliberately don't pass through this component —
// they use their own per-card save model in `SettingsGroupCard`.
type MetaBoxCardEntry =
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
    // Container-query root so field spans resolve against the card's
    // own width — same span renders consistently in a full-width route
    // and a narrow sidebar, where viewport-based breakpoints would lie.
    <Card className="@container" data-testid={`meta-box-${box.id}`}>
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
      <CardContent className="grid grid-cols-12 gap-4">
        {box.fields.map((field) => (
          <MetaBoxField
            key={field.key}
            field={field}
            value={values[field.key]}
            disabled={disabled}
            onChange={(next) => {
              onChange(field.key, next);
            }}
            className={metaBoxFieldColSpanClass(field.span)}
          />
        ))}
      </CardContent>
    </Card>
  );
}
