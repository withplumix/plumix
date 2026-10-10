import { useMemo } from "react";
import { useLingui } from "@lingui/react";

import type { Label } from "@plumix/core/i18n";
import { resolveLabel } from "@plumix/core/i18n";

/**
 * Stable per locale. Passes no `values`, so a descriptor with ICU placeholders
 * renders its template literally.
 */
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
