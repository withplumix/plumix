import type { ReactElement } from "react";

import type { LucideIcon } from "@plumix/admin-ui/icons";
import { blockIcons, fallbackBlockIcon } from "@plumix/admin-ui/icons";

// `blockIcons` has literal keys; widen to a string index so a runtime block
// name can address it.
const Icons: Record<string, LucideIcon> = blockIcons;

/**
 * Renders a block's declared icon by its `icon: "Heading"` name, resolved
 * against admin-ui's curated `blockIcons` map (the single owner of the set).
 * Unknown names fall back to a generic square — that's the path a third-party
 * block hits when it names an icon plumix doesn't ship.
 */
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
