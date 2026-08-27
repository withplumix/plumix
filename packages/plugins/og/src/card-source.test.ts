import type { TemplateData } from "plumix";
import { describe, expect, test } from "vitest";

import type { CardDefinition } from "./card.js";
import { cardSourceHash } from "./card-source.js";

function design(): CardDefinition<TemplateData> {
  return {
    key: () => ({ id: "fixed", tag: "og:fixed" }),
    render: () => ({ type: "text", text: "Read this" }),
  };
}

describe("the card-source hash", () => {
  test("is the same for a card nobody edited", async () => {
    expect(await cardSourceHash(design())).toBe(await cardSourceHash(design()));
  });

  // What the card reads is already in the key its own callback returns, so
  // folding that callback's source in as well would only re-render every card
  // behind a reformatted comment.
  test("ignores an edit to the key callback", async () => {
    const edited: CardDefinition<TemplateData> = {
      ...design(),
      key: () => ({ id: "fixed", tag: "og:fixed" }),
    };

    expect(await cardSourceHash(edited)).toBe(await cardSourceHash(design()));
  });

  test("moves when the card is resized", async () => {
    const edited: CardDefinition<TemplateData> = { ...design(), width: 800 };

    expect(await cardSourceHash(edited)).not.toBe(
      await cardSourceHash(design()),
    );
  });
});
