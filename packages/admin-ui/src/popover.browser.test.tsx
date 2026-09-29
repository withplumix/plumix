import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import type { PopoverContentVariant } from "./popover.js";
import { Popover, PopoverContent } from "./popover.js";

let unmount: (() => void) | undefined;

afterEach(() => {
  unmount?.();
  unmount = undefined;
});

function contentClasses(variant?: PopoverContentVariant): string[] {
  const root = createRoot(
    document.body.appendChild(document.createElement("div")),
  );
  unmount = () => {
    act(() => root.unmount());
  };
  act(() => {
    root.render(
      <Popover open>
        <PopoverContent variant={variant} data-testid="popover">
          x
        </PopoverContent>
      </Popover>,
    );
  });
  const content = document.querySelector('[data-testid="popover"]');
  return content?.className.split(" ") ?? [];
}

describe("PopoverContent variant", () => {
  it("pads the default popover and leaves a flush one to its content", () => {
    expect(contentClasses()).toContain("p-4");
    unmount?.();
    const flush = contentClasses("flush");
    expect(flush).toContain("p-0");
    expect(flush).not.toContain("p-4");
  });
});
