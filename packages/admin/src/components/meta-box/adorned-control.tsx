import type { ReactNode } from "react";
import { useLabel } from "@/lib/use-label.js";

import type { MetaBoxFieldManifestEntry } from "@plumix/core/manifest";
import { InputGroup, InputGroupAddon } from "@plumix/admin-ui/input-group";

/**
 * Addons sit beside the `<FormControl>`, not inside, so its Slot keeps
 * forwarding id / aria-* onto the real input.
 */
export function AdornedControl({
  field,
  testId,
  block = false,
  children,
}: {
  readonly field: Pick<MetaBoxFieldManifestEntry, "prepend" | "append">;
  readonly testId: string;
  readonly block?: boolean;
  readonly children: ReactNode;
}): ReactNode {
  const renderLabel = useLabel();
  return (
    <InputGroup>
      {field.prepend !== undefined ? (
        <InputGroupAddon
          align={block ? "block-start" : "inline-start"}
          data-testid={`${testId}-prepend`}
        >
          {renderLabel(field.prepend)}
        </InputGroupAddon>
      ) : null}
      {children}
      {field.append !== undefined ? (
        <InputGroupAddon
          align={block ? "block-end" : "inline-end"}
          data-testid={`${testId}-append`}
        >
          {renderLabel(field.append)}
        </InputGroupAddon>
      ) : null}
    </InputGroup>
  );
}
