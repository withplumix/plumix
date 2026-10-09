import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { PopoverContentVariant } from "./popover.js";
import { Popover, PopoverContent } from "./popover.js";

afterEach(cleanup);

function contentClasses(variant?: PopoverContentVariant): string[] {
  render(
    <Popover open>
      <PopoverContent variant={variant} data-testid="popover">
        x
      </PopoverContent>
    </Popover>,
  );
  const content = document.querySelector('[data-testid="popover"]');
  return content?.className.split(" ") ?? [];
}

describe("PopoverContent variant", () => {
  it("pads the default popover and leaves a flush one to its content", () => {
    expect(contentClasses()).toContain("p-4");
    cleanup();
    const flush = contentClasses("flush");
    expect(flush).toContain("p-0");
    expect(flush).not.toContain("p-4");
  });
});
