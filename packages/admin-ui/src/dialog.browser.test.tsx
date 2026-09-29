import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import type { DialogContentSize, DialogContentVariant } from "./dialog.js";
import { Dialog, DialogContent, DialogTitle } from "./dialog.js";

let unmount: (() => void) | undefined;

afterEach(() => {
  unmount?.();
  unmount = undefined;
});

function contentClasses(
  props: { size?: DialogContentSize; variant?: DialogContentVariant } = {},
): string[] {
  const root = createRoot(
    document.body.appendChild(document.createElement("div")),
  );
  unmount = () => {
    act(() => root.unmount());
  };
  act(() => {
    root.render(
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
  });
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
    unmount?.();
    expect(widthClass("md")).toEqual(["sm:max-w-2xl"]);
    unmount?.();
    expect(widthClass("lg")).toEqual(["sm:max-w-4xl"]);
  });
});

describe("DialogContent variant", () => {
  it("pads the default dialog and leaves a flush one to its content", () => {
    expect(contentClasses()).toContain("p-6");
    unmount?.();
    const flush = contentClasses({ variant: "flush" });
    expect(flush).toEqual(expect.arrayContaining(["p-0", "overflow-hidden"]));
    expect(flush).not.toContain("p-6");
  });
});
