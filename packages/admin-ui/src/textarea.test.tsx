import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Textarea } from "./textarea.js";

function classesOf(markup: string): string[] {
  return /class="([^"]*)"/.exec(markup)?.[1]?.split(" ") ?? [];
}

describe("Textarea variants", () => {
  it("sets machine-readable text in mono", () => {
    expect(
      classesOf(renderToStaticMarkup(<Textarea variant="code" />)),
    ).toContain("font-mono");
  });

  it("keeps the default textarea in the body face", () => {
    expect(classesOf(renderToStaticMarkup(<Textarea />))).not.toContain(
      "font-mono",
    );
  });
});
