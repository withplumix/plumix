import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Input } from "./input.js";

function classesOf(markup: string): string[] {
  return /class="([^"]*)"/.exec(markup)?.[1]?.split(" ") ?? [];
}

describe("Input variants", () => {
  it("hides an inline input's box until it is hovered or focused", () => {
    const classes = classesOf(renderToStaticMarkup(<Input variant="inline" />));
    expect(classes).toEqual(
      expect.arrayContaining([
        "border-transparent",
        "bg-transparent",
        "hover:bg-accent",
        "focus-visible:bg-background",
      ]),
    );
    expect(classes).not.toContain("border-input");
  });

  it("shows a generated value as muted mono on a muted fill", () => {
    const classes = classesOf(
      renderToStaticMarkup(<Input variant="generated" readOnly />),
    );
    expect(classes).toEqual(
      expect.arrayContaining([
        "border-input",
        "bg-muted",
        "text-muted-foreground",
        "font-mono",
      ]),
    );
    expect(classes).not.toContain("bg-transparent");
  });

  it("keeps the default input's border", () => {
    expect(classesOf(renderToStaticMarkup(<Input />))).toContain(
      "border-input",
    );
  });
});
