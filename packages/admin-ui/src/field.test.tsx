import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Field, FieldLabel, FieldTitle } from "./field.js";

function classesOf(markup: string): string[] {
  return /class="([^"]*)"/.exec(markup)?.[1]?.split(" ") ?? [];
}

describe("Field size", () => {
  it("tightens a small field and marks it for its label", () => {
    const markup = renderToStaticMarkup(<Field size="sm">x</Field>);
    expect(markup).toContain('data-size="sm"');
    expect(classesOf(markup)).toContain("gap-1");
    expect(classesOf(markup)).not.toContain("gap-3");
  });

  it("keeps the default field's spacing", () => {
    const markup = renderToStaticMarkup(<Field>x</Field>);
    expect(markup).toContain('data-size="default"');
    expect(classesOf(markup)).toContain("gap-3");
  });

  it("shrinks the label and the title inside a small field", () => {
    for (const markup of [
      renderToStaticMarkup(<FieldLabel>x</FieldLabel>),
      renderToStaticMarkup(<FieldTitle>x</FieldTitle>),
    ]) {
      expect(classesOf(markup)).toContain("group-data-[size=sm]/field:text-xs");
    }
  });
});
