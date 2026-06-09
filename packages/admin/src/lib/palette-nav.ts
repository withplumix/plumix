import type { Label } from "@plumix/core/i18n";
import type { CoreIconName, PlumixManifest } from "@plumix/core/manifest";

import { visibleAdminNav } from "./manifest.js";

interface PaletteNavItem {
  readonly to: string;
  readonly label: Label;
  readonly coreIcon?: CoreIconName;
}

// Reuses `visibleAdminNav` verbatim so palette navigation can never drift
// from the sidebar — same source, same capability filtering.
export function paletteNavItems(
  capabilities: readonly string[],
  source?: PlumixManifest,
): readonly PaletteNavItem[] {
  return visibleAdminNav(capabilities, source).flatMap((group) =>
    group.items.map((item) => ({
      to: item.to,
      label: item.label,
      ...(item.coreIcon ? { coreIcon: item.coreIcon } : {}),
    })),
  );
}
