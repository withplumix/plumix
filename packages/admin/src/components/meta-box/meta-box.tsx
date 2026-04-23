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
 * term / user). Expects an ancestor `<Form>` provider — each field
 * binds to `${basePath}.${field.key}` via react-hook-form context.
 */
export function MetaBoxCard({
  box,
  basePath,
  disabled = false,
}: {
  readonly box: MetaBoxCardEntry;
  readonly basePath: string;
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
            name={`${basePath}.${field.key}`}
            disabled={disabled}
            className={metaBoxFieldColSpanClass(field.span)}
          />
        ))}
      </CardContent>
    </Card>
  );
}
