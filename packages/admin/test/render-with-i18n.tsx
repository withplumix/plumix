import type { ReactNode } from "react";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { render, renderHook } from "@testing-library/react";

// Suites that switch locale reset it to `en` themselves, so this module-top
// init is enough.
i18n.load({ en: {} });
i18n.activate("en");

function I18nWrapper({ children }: { children: ReactNode }): ReactNode {
  return <I18nProvider i18n={i18n}>{children}</I18nProvider>;
}

/** Passed via the `wrapper` option so the provider survives `rerender`. */
export function renderWithI18n(node: ReactNode): ReturnType<typeof render> {
  return render(node, { wrapper: I18nWrapper });
}

/**
 * Hook variant — same `I18nProvider` wrapping for `renderHook`.
 * Use when testing a custom hook that
 * calls `useLabel` / `useLingui` internally.
 */
export function renderHookWithI18n<TResult, TProps>(
  callback: (props: TProps) => TResult,
): ReturnType<typeof renderHook<TResult, TProps>> {
  return renderHook(callback, { wrapper: I18nWrapper });
}
