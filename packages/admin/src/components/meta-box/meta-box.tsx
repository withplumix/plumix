import type { ReactNode } from "react";
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion.js";
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

interface MetaBoxProps {
  readonly box: MetaBoxCardEntry;
  readonly basePath: string;
  readonly disabled?: boolean;
}

/**
 * Card variant — used by standalone meta-box surfaces (term + user
 * edit forms) where the box is its own card on the page. Entry-editor
 * rail uses `MetaBoxAccordionItem` instead.
 *
 * Expects an ancestor `<Form>` provider — each field binds to
 * `${basePath}.${field.key}` via react-hook-form context.
 */
export function MetaBoxCard({
  box,
  basePath,
  disabled = false,
}: MetaBoxProps): ReactNode {
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
      <CardContent>
        <MetaBoxFieldsGrid box={box} basePath={basePath} disabled={disabled} />
      </CardContent>
    </Card>
  );
}

/**
 * Accordion-section variant — used inside the entry editor's right
 * rail, where meta boxes stack as collapsible sections alongside
 * built-in document panels (Permalink, Status, Excerpt). Must render
 * inside an `<Accordion>` parent; `box.id` is the accordion value.
 */
export function MetaBoxAccordionItem({
  box,
  basePath,
  disabled = false,
}: MetaBoxProps): ReactNode {
  return (
    <AccordionItem
      value={box.id}
      className="@container"
      data-testid={`meta-box-${box.id}`}
    >
      <AccordionTrigger
        className="px-4 py-3 text-sm font-semibold"
        data-testid={`meta-box-heading-${box.id}`}
      >
        {box.label}
      </AccordionTrigger>
      <AccordionContent className="px-4 pb-4">
        {box.description ? (
          <p className="text-muted-foreground mb-3 text-sm">
            {box.description}
          </p>
        ) : null}
        <MetaBoxFieldsGrid box={box} basePath={basePath} disabled={disabled} />
      </AccordionContent>
    </AccordionItem>
  );
}

function MetaBoxFieldsGrid({
  box,
  basePath,
  disabled,
}: MetaBoxProps): ReactNode {
  return (
    <div className="grid grid-cols-12 gap-4">
      {box.fields.map((field) => (
        <MetaBoxField
          key={field.key}
          field={field}
          name={`${basePath}.${field.key}`}
          disabled={disabled ?? false}
          className={metaBoxFieldColSpanClass(field.span)}
        />
      ))}
    </div>
  );
}
