import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, test } from "vitest";

import { MobileSidebarSheet } from "./MobileSidebarSheet.js";

afterEach(() => {
  cleanup();
});

describe("MobileSidebarSheet", () => {
  test("renders the trigger with the caller-supplied label and testid", () => {
    render(
      <MobileSidebarSheet
        triggerLabel="Blocks"
        triggerTestId="example-trigger"
        triggerSide="left"
        sheetTitle="Blocks"
        sheetDescription="Insertable blocks for the editor."
      >
        <div data-testid="sheet-body">body</div>
      </MobileSidebarSheet>,
    );

    const trigger = screen.getByTestId("example-trigger");
    expect(trigger.textContent).toBe("Blocks");
  });

  test("positions the trigger on the left when triggerSide='left'", () => {
    render(
      <MobileSidebarSheet
        triggerLabel="Blocks"
        triggerTestId="example-trigger"
        triggerSide="left"
        sheetTitle="Blocks"
        sheetDescription="."
      >
        <div data-testid="sheet-body">body</div>
      </MobileSidebarSheet>,
    );

    const trigger = screen.getByTestId("example-trigger");
    expect(trigger.className).toContain("left-4");
    expect(trigger.className).not.toContain("right-4");
  });

  test("positions the trigger on the right when triggerSide='right'", () => {
    render(
      <MobileSidebarSheet
        triggerLabel="Inspector"
        triggerTestId="example-trigger"
        triggerSide="right"
        sheetTitle="Inspector"
        sheetDescription="."
      >
        <div data-testid="sheet-body">body</div>
      </MobileSidebarSheet>,
    );

    const trigger = screen.getByTestId("example-trigger");
    expect(trigger.className).toContain("right-4");
    expect(trigger.className).not.toContain("left-4");
  });

  test("reveals the children inside the sheet content after the trigger is clicked", async () => {
    const user = userEvent.setup();
    render(
      <MobileSidebarSheet
        triggerLabel="Inspector"
        triggerTestId="example-trigger"
        triggerSide="right"
        sheetTitle="Inspector"
        sheetDescription="."
      >
        <div data-testid="sheet-body">body</div>
      </MobileSidebarSheet>,
    );

    expect(screen.queryByTestId("sheet-body")).toBeNull();

    await user.click(screen.getByTestId("example-trigger"));

    expect(screen.getByTestId("sheet-body")).toBeDefined();
  });
});
