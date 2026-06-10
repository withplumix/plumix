import type { Label } from "@plumix/core/i18n";
import type { CoreIconName, PlumixManifest } from "@plumix/core/manifest";

import { visibleAdminNav } from "./manifest.js";

interface PaletteNavItem {
  readonly to: string;
  readonly label: Label;
  readonly coreIcon?: CoreIconName;
  readonly keywords?: readonly Label[];
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
      ...(item.keywords ? { keywords: item.keywords } : {}),
    })),
  );
}

/** `toText` is the caller's i18n-bound `Label` resolver; mirrors
 *  `selectCommands`. */
export function selectNavItems(
  items: readonly PaletteNavItem[],
  query: string,
  toText: (label: Label) => string,
): readonly PaletteNavItem[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return items;
  return items.filter((item) => {
    const haystack = [item.label, ...(item.keywords ?? [])]
      .map(toText)
      .join(" ");
    return haystack.toLowerCase().includes(needle);
  });
}
