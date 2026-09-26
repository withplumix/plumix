import type { ReactNode } from "react";
import { useLabel } from "@/lib/use-label.js";

import type { MetaBoxFieldManifestEntry } from "@plumix/core/manifest";
import { InputGroup, InputGroupAddon } from "@plumix/admin-ui/input-group";

// The addons sit beside `children` (a `<FormControl>`), not inside it,
// so the Slot keeps forwarding id / aria-* onto the real input. `block`
// stacks them above and below, the layout a textarea's height calls for.
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
