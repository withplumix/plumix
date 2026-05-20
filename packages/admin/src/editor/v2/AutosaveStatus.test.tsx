import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { AutosaveStatusContext, AutosaveStatusPill } from "./AutosaveStatus.js";

afterEach(() => {
  cleanup();
});

describe("AutosaveStatusPill", () => {
  test("renders 'Saved' by default (no Provider above)", () => {
    render(<AutosaveStatusPill />);

    const pill = screen.getByTestId("plumix-autosave-pill");
    expect(pill.textContent).toBe("Saved");
    expect(pill.getAttribute("data-status")).toBe("saved");
  });

  test("renders 'Saving...' when the Provider supplies the 'saving' status", () => {
    render(
      <AutosaveStatusContext.Provider value="saving">
        <AutosaveStatusPill />
      </AutosaveStatusContext.Provider>,
    );

    const pill = screen.getByTestId("plumix-autosave-pill");
    expect(pill.textContent).toBe("Saving...");
    expect(pill.getAttribute("data-status")).toBe("saving");
  });
});
