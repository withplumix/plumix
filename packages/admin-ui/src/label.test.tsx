import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FieldLabel } from "./field.js";
import { Label } from "./label.js";

function classesOf(markup: string): string[] {
  return /class="([^"]*)"/.exec(markup)?.[1]?.split(" ") ?? [];
}

describe("Label variants", () => {
  it("sets a choice's label in the body weight", () => {
    const classes = classesOf(
      renderToStaticMarkup(<Label variant="choice">x</Label>),
    );
    expect(classes).toContain("font-normal");
    expect(classes).not.toContain("font-medium");
  });

  it("sets a caption small and muted, through FieldLabel too", () => {
    for (const markup of [
      renderToStaticMarkup(<Label variant="caption">x</Label>),
      renderToStaticMarkup(<FieldLabel variant="caption">x</FieldLabel>),
    ]) {
      expect(classesOf(markup)).toEqual(
        expect.arrayContaining(["text-xs", "text-muted-foreground"]),
      );
    }
  });

  it("keeps the default label medium", () => {
    expect(classesOf(renderToStaticMarkup(<Label>x</Label>))).toContain(
      "font-medium",
    );
  });
});
