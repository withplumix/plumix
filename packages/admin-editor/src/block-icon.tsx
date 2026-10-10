import type { ReactElement } from "react";

import type { LucideIcon } from "@plumix/admin-ui/icons";
import { blockIcons, fallbackBlockIcon } from "@plumix/admin-ui/icons";

// `blockIcons` has literal keys; widen to a string index so a runtime block
// name can address it.
const Icons: Record<string, LucideIcon> = blockIcons;

/** An icon name plumix doesn't ship falls back to a generic square. */
export function BlockIcon({
  name,
  className,
}: {
  readonly name?: string;
  readonly className?: string;
}): ReactElement {
  const Icon = (name ? Icons[name] : undefined) ?? fallbackBlockIcon;
  return <Icon className={className} />;
}
