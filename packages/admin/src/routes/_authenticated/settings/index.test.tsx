import { i18n } from "@lingui/core";
import { I18nProvider, Trans } from "@lingui/react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test } from "vitest";

// Pins the ICU plural compile path used by `settings.pageSummary` in
// `settings/index.tsx`. Lingui v6's runtime `<Trans>` evaluates ICU
// `{count, plural, ...}` via `@lingui/message-utils` at render time —
// admin doesn't wire `@lingui/react/macro`, so the runtime path is
// the canonical way to ship a plural here. This test guards against
// a future Lingui upgrade silently dropping the runtime ICU path.

beforeEach(() => {
  i18n.load({ en: {} });
  i18n.activate("en");
});

afterEach(() => cleanup());

const PLURAL = "{count, plural, one {# group} other {# groups}}";

test("settings.pageSummary renders the singular form for 1 group", () => {
  render(
    <I18nProvider i18n={i18n}>
      <span data-testid="summary">
        <Trans
          id="settings.pageSummary"
          message={PLURAL}
          values={{ count: 1 }}
        />
      </span>
    </I18nProvider>,
  );
  expect(screen.getByTestId("summary").textContent).toBe("1 group");
});

test("settings.pageSummary renders the plural form for >1 groups", () => {
  render(
    <I18nProvider i18n={i18n}>
      <span data-testid="summary">
        <Trans
          id="settings.pageSummary"
          message={PLURAL}
          values={{ count: 4 }}
        />
      </span>
    </I18nProvider>,
  );
  expect(screen.getByTestId("summary").textContent).toBe("4 groups");
});

test("settings.pageSummary renders the plural form for 0 groups", () => {
  render(
    <I18nProvider i18n={i18n}>
      <span data-testid="summary">
        <Trans
          id="settings.pageSummary"
          message={PLURAL}
          values={{ count: 0 }}
        />
      </span>
    </I18nProvider>,
  );
  expect(screen.getByTestId("summary").textContent).toBe("0 groups");
});
