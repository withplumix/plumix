import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, test } from "vitest";

import { messages as enMessages } from "../../locales/en.mjs";
import { ErrorBoundaryFallback } from "./error-boundary-fallback.js";

beforeAll(() => {
  i18n.load("en", enMessages);
  i18n.activate("en");
});

afterEach(() => {
  cleanup();
});

function renderFallback(error: Error): void {
  render(
    <I18nProvider i18n={i18n}>
      <ErrorBoundaryFallback error={error} reset={() => {}} />
    </I18nProvider>,
  );
}

describe("ErrorBoundaryFallback", () => {
  test("renders a translated title from the active locale catalog", () => {
    renderFallback(new Error("boom"));
    expect(screen.getByTestId("error-boundary-title")).toBeTruthy();
  });

  test("toggles the error message via the Show/Hide button", async () => {
    renderFallback(new Error("boom-message"));
    const toggle = screen.getByTestId("error-boundary-toggle");
    expect(screen.queryByTestId("error-boundary-message")).toBeNull();
    await userEvent.click(toggle);
    expect(screen.getByTestId("error-boundary-message").textContent).toContain(
      "boom-message",
    );
    await userEvent.click(toggle);
    expect(screen.queryByTestId("error-boundary-message")).toBeNull();
  });
});
