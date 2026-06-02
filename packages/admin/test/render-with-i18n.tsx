import type { ReactNode } from "react";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { render } from "@testing-library/react";

// Module-top init: idempotent — running it once per test worker keeps
// `i18n.locale === "en"` for every component test that renders a
// `<Trans>` or calls `useLingui` / `useLabel`. No test in admin
// mutates the catalog (`load`) or the active locale (`activate`)
// outside of `LocaleSwitcher`'s own suite, which scopes its mutations
// via its own `beforeEach`.
i18n.load({ en: {} });
i18n.activate("en");

function I18nWrapper({ children }: { children: ReactNode }): ReactNode {
  return <I18nProvider i18n={i18n}>{children}</I18nProvider>;
}

/**
 * Wraps `@testing-library/react`'s `render` with the Lingui
 * `I18nProvider` so a `<Trans>` / `useLingui` / `useLabel` consumer
 * mounts without throwing "rendered without I18nProvider". Passed via
 * the `wrapper` option so the wrapper survives `rerender` calls
 * returned by the result.
 *
 * Use over `render` for any component that uses Lingui internally.
 */
export function renderWithI18n(node: ReactNode): ReturnType<typeof render> {
  return render(node, { wrapper: I18nWrapper });
}
