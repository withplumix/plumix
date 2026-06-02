import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { renderWithI18n } from "../../test/render-with-i18n.js";
import { AutosaveStatusContext, AutosaveStatusPill } from "./AutosaveStatus.js";

afterEach(() => {
  cleanup();
});

describe("AutosaveStatusPill", () => {
  test("renders 'Saved' by default (no Provider above)", () => {
    renderWithI18n(<AutosaveStatusPill />);

    const pill = screen.getByTestId("plumix-autosave-pill");
    expect(pill.textContent).toBe("Saved");
    expect(pill.getAttribute("data-status")).toBe("saved");
  });

  test("renders 'Saving...' when the Provider supplies the 'saving' status", () => {
    renderWithI18n(
      <AutosaveStatusContext.Provider value="saving">
        <AutosaveStatusPill />
      </AutosaveStatusContext.Provider>,
    );

    const pill = screen.getByTestId("plumix-autosave-pill");
    expect(pill.textContent).toBe("Saving...");
    expect(pill.getAttribute("data-status")).toBe("saving");
  });

  test("renders 'Failed to save' when the Provider supplies the 'error' status", () => {
    renderWithI18n(
      <AutosaveStatusContext.Provider value="error">
        <AutosaveStatusPill />
      </AutosaveStatusContext.Provider>,
    );

    const pill = screen.getByTestId("plumix-autosave-pill");
    expect(pill.textContent).toBe("Failed to save");
    expect(pill.getAttribute("data-status")).toBe("error");
  });
});
