import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Card, CardTitle } from "./card.js";

function classesOf(markup: string): string[] {
  return /class="([^"]*)"/.exec(markup)?.[1]?.split(" ") ?? [];
}

describe("Card variants", () => {
  it("highlights an interactive card's border on hover", () => {
    expect(
      classesOf(renderToStaticMarkup(<Card variant="interactive">x</Card>)),
    ).toEqual(
      expect.arrayContaining(["hover:border-primary", "transition-colors"]),
    );
  });

  it("borders a destructive card in red and reds its title", () => {
    const markup = renderToStaticMarkup(<Card variant="destructive">x</Card>);
    expect(markup).toContain('data-variant="destructive"');
    expect(classesOf(markup)).toContain("border-destructive/50");
    expect(classesOf(renderToStaticMarkup(<CardTitle>x</CardTitle>))).toContain(
      "group-data-[variant=destructive]/card:text-destructive",
    );
  });
});
