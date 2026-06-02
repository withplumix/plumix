import { i18n } from "@lingui/core";
import { I18nProvider, Trans } from "@lingui/react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

// Regression guard for `settings.page.empty.description`: literal `{` /
// `}` characters in the source `message` are treated as ICU placeholder
// openers by Lingui's MessageFormat compiler, which throws `invalid
// syntax` and falls back to the source string. The fix is the ICU
// `quote-literal` escape — `'{'` / `'}'`. This test fails if the source
// regresses to bare braces by asserting (a) the rendered output keeps
// the literal braces verbatim and (b) no parse error fires.

beforeEach(() => {
  i18n.load({ en: {} });
  i18n.activate("en");
});

afterEach(() => cleanup());

const MESSAGE =
  "Plugins compose pages with <0>ctx.registerSettingsPage(name, '{' groups: [...] '}')</0>.";

test("empty-state description renders literal braces from the ICU-escaped source", () => {
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  render(
    <I18nProvider i18n={i18n}>
      <span data-testid="desc">
        <Trans
          id="settings.page.empty.description"
          message={MESSAGE}
          components={{ 0: <code data-testid="code" /> }}
        />
      </span>
    </I18nProvider>,
  );

  expect(screen.getByTestId("code").textContent).toBe(
    "ctx.registerSettingsPage(name, { groups: [...] })",
  );
  expect(errorSpy).not.toHaveBeenCalled();

  errorSpy.mockRestore();
});
