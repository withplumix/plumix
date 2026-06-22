import type { ComponentType, ReactElement } from "react";

import * as LucideIcons from "@plumix/admin-ui/icons";

type IconComponent = ComponentType<{ readonly className?: string }>;

// Blocks declare `icon` as a lucide name (e.g. "Heading"); resolve it off the
// shared icon barrel so core and plugin blocks alike render their own glyph.
const ICONS = LucideIcons as unknown as Record<
  string,
  IconComponent | undefined
>;
const Fallback = ICONS.Square ?? (() => null);

/** Renders a block's declared lucide icon, falling back to a generic square. */
export function BlockIcon({
  name,
  className,
}: {
  readonly name?: string;
  readonly className?: string;
}): ReactElement {
  const Icon = (name ? ICONS[name] : undefined) ?? Fallback;
  return <Icon className={className} />;
}
