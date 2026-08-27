import { describe, expect, test } from "vitest";

import type { CardPalette } from "./index.js";
import type { FakeRenderer } from "./test/fake-renderer.js";
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

// The demo theme's editorial palette, spelled under the three names the bundled
// card looks for.
const EDITORIAL = {
  color: {
    background: { value: "#fbfaf8" },
    foreground: { value: "#1b1a17" },
    "muted-foreground": { value: "#6f6b63" },
  },
};

const EDITORIAL_CARD_CSS =
  ":root { --plumix-og-background: #fbfaf8;" +
  " --plumix-og-foreground: #1b1a17;" +
  " --plumix-og-muted-foreground: #6f6b63; }";

/** The sheets one render was handed, in the order they reach the engine. */
function sheetsOf(fake: FakeRenderer): readonly string[] {
  return fake.inputs[0]?.stylesheets ?? [];
}

describe("the bundled default card's palette", () => {
  test("paints in the theme's own colours when it named all three", async () => {
    const fake = createFakeRenderer();
    const harness = await createHarness({
      renderer: fake.renderer,
      tokens: EDITORIAL,
    });
    const id = await seedEntry(harness);

    await fetchCard(harness, id);

    // Between the theme's own sheet and the card's: the card falls back to
    // these, so nothing of its own has to be displaced for them to land.
    expect(sheetsOf(fake)).toHaveLength(3);
    expect(sheetsOf(fake)[1]).toBe(EDITORIAL_CARD_CSS);
  });

  test("keeps its own colours when the theme named only some of them", async () => {
    const fake = createFakeRenderer();
    const harness = await createHarness({
      renderer: fake.renderer,
      // The ground and nothing else: taking it alone would paint the bundled
      // card's near-white ink onto the theme's paper.
      tokens: { color: { background: { value: "#fbfaf8" } } },
    });
    const id = await seedEntry(harness);

    await fetchCard(harness, id);

    // No sheet *declares* the property — the card's own only reads it, through
    // the `var()` fallback that paints its bundled colour.
    expect(sheetsOf(fake).join("")).not.toContain("--plumix-og-background:");
  });

  test("keeps its own colours when one of the three resolves to nothing", async () => {
    const fake = createFakeRenderer();
    const harness = await createHarness({
      renderer: fake.renderer,
      tokens: {
        color: {
          ...EDITORIAL.color,
          // Named for the editor's picker, defined by the theme's own CSS —
          // which a card rendering away from the page never loads.
          "muted-foreground": { label: "Muted" },
        },
      },
    });
    const id = await seedEntry(harness);

    await fetchCard(harness, id);

    // No sheet *declares* the property — the card's own only reads it, through
    // the `var()` fallback that paints its bundled colour.
    expect(sheetsOf(fake).join("")).not.toContain("--plumix-og-background:");
  });

  test("keeps its own colours when a role names nothing the theme declared", async () => {
    const fake = createFakeRenderer();
    const harness = await createHarness({
      renderer: fake.renderer,
      tokens: EDITORIAL,
      // A name off `Object.prototype` rather than a plain typo, since that is
      // the one a bare property read answers with something.
      palette: { background: "constructor" },
    });
    const id = await seedEntry(harness);

    await fetchCard(harness, id);

    // No sheet *declares* the property — the card's own only reads it, through
    // the `var()` fallback that paints its bundled colour.
    expect(sheetsOf(fake).join("")).not.toContain("--plumix-og-background:");
  });

  test("takes the palette of a theme that names its colours its own way", async () => {
    const fake = createFakeRenderer();
    const harness = await createHarness({
      renderer: fake.renderer,
      // The palette the demo theme actually ships, which the convention guesses
      // none of.
      tokens: {
        color: {
          paper: { value: "#fbfaf8" },
          ink: { value: "#1b1a17" },
          muted: { value: "#6f6b63" },
        },
      },
      palette: {
        background: "paper",
        foreground: "ink",
        mutedForeground: "muted",
      },
    });
    const id = await seedEntry(harness);

    await fetchCard(harness, id);

    expect(sheetsOf(fake)).toHaveLength(3);
    expect(sheetsOf(fake)[1]).toBe(EDITORIAL_CARD_CSS);
  });

  test("lands the card on a fresh key when the palette is repointed", async () => {
    const etagOf = async (palette?: CardPalette): Promise<string | null> => {
      const harness = await createHarness({
        tokens: {
          color: { ...EDITORIAL.color, paper: { value: "#0b1220" } },
        },
        palette,
      });
      const id = await seedEntry(harness);
      return (await fetchCard(harness, id)).headers.get("etag");
    };

    // One theme, one token sheet: where the card reads its ground from is the
    // whole difference, and the bytes behind the old URL are no longer what it
    // renders.
    expect(await etagOf()).not.toBe(await etagOf({ background: "paper" }));
  });
});
