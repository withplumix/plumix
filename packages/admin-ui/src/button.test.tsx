import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Button } from "./button.js";

function classesOf(markup: string): string[] {
  return /class="([^"]*)"/.exec(markup)?.[1]?.split(" ") ?? [];
}

describe("Button variants", () => {
  it("draws a trigger as a full-width outline that mutes its placeholder", () => {
    const classes = classesOf(
      renderToStaticMarkup(
        <Button variant="trigger" data-placeholder="">
          x
        </Button>,
      ),
    );
    expect(classes).toEqual(
      expect.arrayContaining([
        "border",
        "bg-background",
        "w-full",
        "justify-between",
        "font-normal",
        "data-[placeholder]:text-muted-foreground",
      ]),
    );
  });

  it("keeps a destructive ghost red through its hover", () => {
    const classes = classesOf(
      renderToStaticMarkup(<Button variant="destructive-ghost">x</Button>),
    );
    expect(classes).toEqual(
      expect.arrayContaining([
        "hover:bg-accent",
        "text-destructive",
        "hover:text-destructive",
      ]),
    );
    expect(classes).not.toContain("hover:text-accent-foreground");
  });

  it("mutes a destructive row until it is hovered", () => {
    const classes = classesOf(
      renderToStaticMarkup(<Button variant="destructive-row">x</Button>),
    );
    expect(classes).toEqual(
      expect.arrayContaining([
        "hover:bg-accent",
        "text-muted-foreground",
        "hover:text-destructive",
      ]),
    );
    expect(classes).not.toContain("hover:text-accent-foreground");
  });
});
