import { useLingui } from "@lingui/react";

import type { Label } from "@plumix/core/i18n";
import { resolveLabel } from "@plumix/core/i18n";

/** Pulls the active Lingui locale and returns a label resolver that
 *  flattens `Label` (string | MessageDescriptor) to a rendered string.
 *  Use at every manifest-label render site so plain strings and
 *  Lingui descriptors round-trip identically. */
export function useLabel(): (label: Label) => string {
  const { i18n } = useLingui();
  return (label) => resolveLabel(label, i18n);
}
