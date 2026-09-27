import type { ReactNode } from "react";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { render, renderHook } from "@testing-library/react";

// Module-top init: idempotent — running it once per test worker keeps
// `i18n.locale === "en"` for every component test that renders a
// `<Trans>` or calls `useLingui` / `useLabel`. A suite that loads a
// catalog or activates another locale resets both to `en` in its own
// `beforeEach` / `afterEach`, so the mutation never leaks to the next
// test.
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

/**
 * Hook variant — same `I18nProvider` wrapping for `renderHook`.
 * Use when testing a custom hook (e.g. `useTermErrorMessage`) that
 * calls `useLabel` / `useLingui` internally.
 */
export function renderHookWithI18n<TResult, TProps>(
  callback: (props: TProps) => TResult,
): ReturnType<typeof renderHook<TResult, TProps>> {
  return renderHook(callback, { wrapper: I18nWrapper });
}
