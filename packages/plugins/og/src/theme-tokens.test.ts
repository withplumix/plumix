import { describe, expect, test } from "vitest";

import { cardKey } from "./card-key.js";
import { card } from "./card.js";
import { createFakeRenderer } from "./test/fake-renderer.js";
import { createHarness, fetchCard, seedEntry } from "./test/harness.js";

const TOKENS = {
  color: { accent: { value: "#b5472d", label: "Accent" } },
  spacing: { gutter: { value: "72px" } },
};

const CARD_STYLES = ".card { color: var(--plumix-color-accent) }";

const themedCard = card.fallback().define({
  styles: [CARD_STYLES],
  key: () => cardKey.of("themed"),
  render: () => ({ type: "text", className: "card", text: "Themed" }),
});

describe("a theme's design tokens", () => {
  test("reach the renderer as a stylesheet the card's var() references resolve against", async () => {
    const fake = createFakeRenderer();
    const harness = await createHarness({
      renderer: fake.renderer,
      cards: [themedCard],
      tokens: TOKENS,
    });
    const id = await seedEntry(harness);

    await fetchCard(harness, id);

    // Ahead of the card's own sheet: the card is written against these, and a
    // card that redefines one is meant to win.
    expect(fake.inputs[0]?.stylesheets).toEqual([
      ":root { --plumix-color-accent: #b5472d; --plumix-spacing-gutter: 72px; }",
      CARD_STYLES,
    ]);
  });

  test("reach a card's callbacks as resolved values, for what it decides in JavaScript", async () => {
    const harness = await createHarness({
      tokens: TOKENS,
      cards: [
        card.fallback().define({
          key: ({ tokens }) => cardKey.of("themed", tokens.color?.accent ?? ""),
          render: ({ tokens }) => ({
            type: "text",
            text: tokens.color?.accent ?? "no accent",
          }),
        }),
      ],
    });
    const id = await seedEntry(harness);

    const body = await (await fetchCard(harness, id)).text();

    // The value itself, not the `var()` reference a stylesheet would carry.
    expect(body).toContain("#b5472d");
  });

  test("leave a card unchanged when the theme declared none", async () => {
    const fake = createFakeRenderer();
    const harness = await createHarness({
      renderer: fake.renderer,
      cards: [themedCard],
    });
    const id = await seedEntry(harness);

    const body = await (await fetchCard(harness, id)).text();

    expect(body).toContain("Themed");
    expect(fake.inputs[0]?.stylesheets).toEqual([CARD_STYLES]);
  });

  test("skip a token the theme's own CSS defines, in both routes", async () => {
    const fake = createFakeRenderer();
    const harness = await createHarness({
      renderer: fake.renderer,
      // Label-only: the theme names the token for the editor's picker and
      // defines the custom property itself, so there is no value to resolve.
      tokens: { color: { accent: { label: "Accent" } } },
      cards: [
        card.fallback().define({
          styles: [CARD_STYLES],
          key: () => cardKey.of("themed"),
          render: ({ tokens }) => ({
            type: "text",
            text: tokens.color?.accent ?? "unresolved",
          }),
        }),
      ],
    });
    const id = await seedEntry(harness);

    const body = await (await fetchCard(harness, id)).text();

    expect(body).toContain("unresolved");
    // Not an empty `:root` rule either — nothing resolved, nothing shipped.
    expect(fake.inputs[0]?.stylesheets).toEqual([CARD_STYLES]);
  });

  test("land the card on a fresh key when one of them is retuned", async () => {
    const etagOf = async (accent: string): Promise<string | null> => {
      const harness = await createHarness({
        cards: [themedCard],
        tokens: { color: { accent: { value: accent } } },
      });
      const id = await seedEntry(harness);
      return (await fetchCard(harness, id)).headers.get("etag");
    };

    // Nothing else about the card moved: the palette is the whole difference,
    // and the stored bytes it produced are no longer what the card renders.
    expect(await etagOf("#b5472d")).not.toBe(await etagOf("#2d6fb5"));
  });
});
