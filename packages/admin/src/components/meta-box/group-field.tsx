import type { ReactNode } from "react";

import type { MetaBoxFieldManifestEntry } from "@plumix/core/manifest";

import { MetaBoxField } from "./meta-box-field.js";

// A group renders its members stacked in a bordered card, each wired to
// `${name}.${member.key}` so the nested object round-trips through RHF
// and server path-addressed errors (`seo.title`) land on the right
// input. Members recurse through `MetaBoxField`, so a group may itself
// hold repeaters or further groups.
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
  const members = field.subFields ?? [];
  return (
    <div
      data-testid={testId}
      className="border-input flex flex-col gap-2 rounded-md border p-2"
    >
      {members.map((member) => (
        <MetaBoxField
          key={member.key}
          field={member}
          name={`${name}.${member.key}`}
          disabled={disabled}
        />
      ))}
    </div>
  );
}
