import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test } from "vitest";

import { renderWithI18n } from "../../test/render-with-i18n.js";
import { ErrorBoundaryFallback } from "./error-boundary-fallback.js";

afterEach(() => {
  cleanup();
});

function renderFallback(error: Error): void {
  renderWithI18n(<ErrorBoundaryFallback error={error} reset={() => {}} />);
}

describe("ErrorBoundaryFallback", () => {
  test("renders a title through the i18n provider", () => {
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
