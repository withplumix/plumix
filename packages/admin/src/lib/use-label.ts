import { useMemo } from "react";
import { useLingui } from "@lingui/react";

import type { Label } from "@plumix/core/i18n";
import { resolveLabel } from "@plumix/core/i18n";

/** Pulls the active Lingui locale and returns a label resolver that
 *  flattens `Label` (string | MessageDescriptor) to a rendered string.
 *  Use at every manifest-label render site so plain strings and
 *  Lingui descriptors round-trip identically. Memoized on `locale` so
 *  consumers can safely include the returned function in `useMemo` /
 *  `useCallback` dep arrays without invalidating on every render —
 *  same shape as `useFormatters`.
 *
 *  This resolver passes `label` straight to `i18n._()` with no `values`
 *  argument, so descriptors that interpolate ICU placeholders render
 *  the template literally. Values-bearing descriptors must call
 *  `i18n._(id, values, { message })` directly (descriptor still lives
 *  in a `defineMessage` block so the extractor sees it). */
export function useLabel(): (label: Label) => string {
  const { i18n } = useLingui();
  const locale = i18n.locale;
  return useMemo(
    () => (label) => resolveLabel(label, i18n),
    // `i18n` is the stable Lingui-context object; depending on `locale`
    // forces re-creation only on locale flip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale],
  );
}
