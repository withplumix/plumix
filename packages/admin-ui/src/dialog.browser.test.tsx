import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { DialogContentSize, DialogContentVariant } from "./dialog.js";
import { Dialog, DialogContent, DialogTitle } from "./dialog.js";

afterEach(cleanup);

function contentClasses(
  props: { size?: DialogContentSize; variant?: DialogContentVariant } = {},
): string[] {
  render(
    <Dialog open>
      <DialogContent
        {...props}
        closeLabel="Close"
        aria-describedby={undefined}
        data-testid="dialog"
      >
        <DialogTitle>x</DialogTitle>
      </DialogContent>
    </Dialog>,
  );
  const content = document.querySelector('[data-testid="dialog"]');
  return content?.className.split(" ") ?? [];
}

function widthClass(size?: DialogContentSize): string[] {
  return contentClasses({ size }).filter((name) =>
    name.startsWith("sm:max-w-"),
  );
}

describe("DialogContent size", () => {
  it("keeps the small width by default and widens with md and lg", () => {
    expect(widthClass()).toEqual(["sm:max-w-lg"]);
    cleanup();
    expect(widthClass("md")).toEqual(["sm:max-w-2xl"]);
    cleanup();
    expect(widthClass("lg")).toEqual(["sm:max-w-4xl"]);
  });
});

describe("DialogContent variant", () => {
  it("pads the default dialog and leaves a flush one to its content", () => {
    expect(contentClasses()).toContain("p-6");
    cleanup();
    const flush = contentClasses({ variant: "flush" });
    expect(flush).toEqual(expect.arrayContaining(["p-0", "overflow-hidden"]));
    expect(flush).not.toContain("p-6");
  });
});
