import type { ReactNode } from "react";
import { useLabel } from "@/lib/use-label.js";

import type {
  EntryMetaBoxManifestEntry,
  TermMetaBoxManifestEntry,
  UserMetaBoxManifestEntry,
} from "@plumix/core/manifest";
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@plumix/admin-ui/accordion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@plumix/admin-ui/card";

import { MetaBoxField } from "./meta-box-field.js";
import { useVisibleFields } from "./use-visible-fields.js";

/**
 * `MetaBoxCard` serves the page-width surfaces (term + user edit). The
 * entry editor rail uses `MetaBoxAccordionItem`, and settings groups
 * use their own per-card save model in `SettingsGroupCard`.
 */
type MetaBoxCardEntry = TermMetaBoxManifestEntry | UserMetaBoxManifestEntry;

interface MetaBoxProps {
  readonly box: MetaBoxCardEntry;
  readonly basePath: string;
  readonly disabled?: boolean;
}

/** Expects an ancestor `<Form>` provider. */
export function MetaBoxCard({
  box,
  basePath,
  disabled = false,
}: MetaBoxProps): ReactNode {
  const renderLabel = useLabel();
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
            {renderLabel(box.label)}
          </h2>
        </CardTitle>
        {box.description ? (
          <CardDescription>{renderLabel(box.description)}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent>
        <MetaBoxFieldsGrid box={box} basePath={basePath} disabled={disabled} />
      </CardContent>
    </Card>
  );
}

interface MetaBoxAccordionItemProps {
  readonly box: EntryMetaBoxManifestEntry;
  readonly basePath: string;
  readonly disabled?: boolean;
}

/**
 * Must render inside an `<Accordion>`; `box.id` is its value. Ignores `span`:
 * the 256px rail can't fit side-by-side fields.
 */
export function MetaBoxAccordionItem({
  box,
  basePath,
  disabled = false,
}: MetaBoxAccordionItemProps): ReactNode {
  const renderLabel = useLabel();
  const visibleFields = useVisibleFields(box.fields, { name: basePath });
  return (
    <AccordionItem value={box.id} data-testid={`meta-box-${box.id}`}>
      <div className="px-4">
        <AccordionTrigger data-testid={`meta-box-heading-${box.id}`}>
          <span className="font-semibold">{renderLabel(box.label)}</span>
        </AccordionTrigger>
        <AccordionContent>
          {box.description ? (
            <p className="text-muted-foreground mb-3 text-sm">
              {renderLabel(box.description)}
            </p>
          ) : null}
          <div className="flex flex-col gap-4">
            {visibleFields.map((field) => (
              <MetaBoxField
                key={field.key}
                field={field}
                name={`${basePath}.${field.key}`}
                disabled={disabled}
              />
            ))}
          </div>
        </AccordionContent>
      </div>
    </AccordionItem>
  );
}

function MetaBoxFieldsGrid({
  box,
  basePath,
  disabled,
}: MetaBoxProps): ReactNode {
  const visibleFields = useVisibleFields(box.fields, { name: basePath });
  return (
    <div className="grid grid-cols-12 gap-4">
      {visibleFields.map((field) => (
        <MetaBoxField
          key={field.key}
          field={field}
          name={`${basePath}.${field.key}`}
          disabled={disabled ?? false}
          span={field.span ?? 12}
        />
      ))}
    </div>
  );
}
