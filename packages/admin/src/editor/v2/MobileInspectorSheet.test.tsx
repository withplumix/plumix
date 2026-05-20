import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, test } from "vitest";

import { MobileInspectorSheet } from "./MobileInspectorSheet.js";

afterEach(() => {
  cleanup();
});

describe("MobileInspectorSheet", () => {
  test("renders the inspector trigger button (always in the DOM)", () => {
    render(
      <MobileInspectorSheet>
        <div data-testid="inspector-body">body</div>
      </MobileInspectorSheet>,
    );

    expect(
      screen.getByTestId("plumix-editor-mobile-inspector-trigger"),
    ).toBeDefined();
  });

  test("reveals the children inside the sheet content after the trigger is clicked", async () => {
    const user = userEvent.setup();
    render(
      <MobileInspectorSheet>
        <div data-testid="inspector-body">body</div>
      </MobileInspectorSheet>,
    );

    expect(screen.queryByTestId("inspector-body")).toBeNull();

    await user.click(
      screen.getByTestId("plumix-editor-mobile-inspector-trigger"),
    );

    expect(screen.getByTestId("inspector-body")).toBeDefined();
  });
});
