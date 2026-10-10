import { i18n } from "@lingui/core";
import { I18nProvider, Trans } from "@lingui/react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test } from "vitest";

// Admin doesn't wire `@lingui/react/macro`, so plurals rely on the runtime
// `<Trans>` ICU path.

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
