import type { ReactNode } from "react";

import type { MetaBoxFieldManifestEntry } from "@plumix/core/manifest";

import { MetaBoxField } from "./meta-box-field.js";
import { useVisibleFields } from "./use-visible-fields.js";

// The `@container` root scopes members' responsive col-span to the card's own
// width.
export function GroupField({
  field,
  name,
  disabled,
  testId,
}: {
  readonly field: MetaBoxFieldManifestEntry;
  readonly name: string;
  readonly disabled: boolean;
  readonly testId: string;
}): ReactNode {
  // `{ name }` scopes the watch to the group's own bag, so a member's
  // condition reads its siblings rather than the whole form.
  const members = useVisibleFields(field.subFields ?? [], { name });
  return (
    <div
      data-testid={testId}
      className="border-input @container rounded-md border p-2"
    >
      <div className="grid grid-cols-12 gap-4">
        {members.map((member) => (
          <MetaBoxField
            key={member.key}
            field={member}
            name={`${name}.${member.key}`}
            disabled={disabled}
            span={member.span ?? 12}
          />
        ))}
      </div>
    </div>
  );
}
