import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { DragHandleButton } from "./DragHandleButton.js";

afterEach(() => {
  cleanup();
});

describe("DragHandleButton", () => {
  test("renders a button with role=button and aria-label", () => {
    render(<DragHandleButton onOpenMenu={vi.fn()} />);
    const handle = screen.getByTestId("drag-handle-button");
    expect(handle.getAttribute("role")).toBe("button");
    expect(handle.getAttribute("aria-label")).toBe("Block actions");
  });

  test("clicking the handle invokes onOpenMenu", () => {
    const onOpenMenu = vi.fn();
    render(<DragHandleButton onOpenMenu={onOpenMenu} />);
    fireEvent.click(screen.getByTestId("drag-handle-button"));
    expect(onOpenMenu).toHaveBeenCalled();
  });

  test("Enter and Space on a focused handle also open the menu", () => {
    const onOpenMenu = vi.fn();
    render(<DragHandleButton onOpenMenu={onOpenMenu} />);
    const handle = screen.getByTestId("drag-handle-button");
    fireEvent.keyDown(handle, { key: "Enter" });
    fireEvent.keyDown(handle, { key: " " });
    expect(onOpenMenu).toHaveBeenCalledTimes(2);
  });
});
