import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Empty } from "./empty.js";

function classesOf(markup: string): string[] {
  return /class="([^"]*)"/.exec(markup)?.[1]?.split(" ") ?? [];
}

describe("Empty variants", () => {
  it("outlines an empty state that stands in for a list", () => {
    expect(
      classesOf(renderToStaticMarkup(<Empty variant="outline">x</Empty>)),
    ).toEqual(expect.arrayContaining(["border", "border-dashed"]));
  });

  it("leaves the default empty state unbordered", () => {
    expect(classesOf(renderToStaticMarkup(<Empty>x</Empty>))).not.toContain(
      "border",
    );
  });
});
