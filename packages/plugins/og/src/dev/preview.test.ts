import { memoryStorage } from "plumix";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { cardKey } from "../card-key.js";
import { card } from "../card.js";
import { createFakeRenderer } from "../test/fake-renderer.js";
import { createHarness } from "../test/harness.js";

const original = process.env.PLUMIX_DEV;

beforeEach(() => {
  process.env.PLUMIX_DEV = "1";
});

afterEach(() => {
  if (original === undefined) delete process.env.PLUMIX_DEV;
  else process.env.PLUMIX_DEV = original;
});

const titleCard = card.entry().define({
  key: ({ data }) => cardKey.entry(data.entry),
  render: ({ data }) => ({ type: "text", text: data.entry.title }),
});

describe("the preview route", () => {
  test("renders a declared rule against sample data", async () => {
    const fake = createFakeRenderer();
    const harness = await createHarness({
      renderer: fake.renderer,
      cards: [titleCard],
    });

    const response = await harness.fetch("/_plumix/og/preview/0.svg");

    expect(response.assertStatus(200).headers.get("content-type")).toBe(
      "image/svg+xml",
    );
    // The sample entry is a pangram, so a preview also shows every letter of
    // the font the card renders with.
    expect(await response.text()).toContain("The quick brown fox");
  });

  test("re-renders on every refresh and stores nothing, so an edit shows up", async () => {
    const fake = createFakeRenderer();
    const storage = memoryStorage().connect({});
    const harness = await createHarness({
      renderer: fake.renderer,
      storage,
      cards: [titleCard],
    });

    await harness.fetch("/_plumix/og/preview/0.svg");
    const second = await harness.fetch("/_plumix/og/preview/0.svg");

    expect(fake.inputs).toHaveLength(2);
    expect(second.headers.get("cache-control")).toBe("no-store");
    expect((await storage.list()).items).toEqual([]);
  });

  test("indexes every declared rule, the plugin's own default included", async () => {
    const harness = await createHarness({ cards: [titleCard] });

    const index = await (await harness.fetch("/_plumix/og/preview")).text();

    // The theme's rule, then the default the plugin keeps behind it.
    expect(index).toContain('src="/_plumix/og/preview/0.svg"');
    expect(index).toContain("0. entry");
    expect(index).toContain('src="/_plumix/og/preview/1.svg"');
    expect(index).toContain("1. fallback");
  });

  test("lists a rule where a page would resolve it, not where it was declared", async () => {
    const harness = await createHarness({
      // Declared generic-first; a post resolves against the matcher, because
      // `resolveRule` walks every targeted rule before any tier.
      cards: [
        titleCard,
        card.forEntryType("post").define({
          key: ({ data }) => cardKey.entry(data.entry),
          render: ({ data }) => ({ type: "text", text: data.entry.slug }),
        }),
      ],
    });

    const index = await (await harness.fetch("/_plumix/og/preview")).text();

    expect(index).toContain("0. post");
    expect(index).toContain("1. entry");
    expect(index).toContain("2. fallback");
  });

  test("previews a targeted rule against the type it narrows on", async () => {
    const harness = await createHarness({
      cards: [
        card.forTermTaxonomy("category").define({
          key: ({ data }) => cardKey.of(data.term.slug),
          render: ({ data }) => ({ type: "text", text: data.taxonomy }),
        }),
      ],
    });

    const svg = await (await harness.fetch("/_plumix/og/preview/0.svg")).text();

    // The card renders its own taxonomy name, which only the matcher supplies —
    // the sample data is invented, so nothing looked "category" up.
    expect(svg).toContain("category");
  });

  test("does not exist without the development gate", async () => {
    delete process.env.PLUMIX_DEV;
    const harness = await createHarness({ cards: [titleCard] });

    (await harness.fetch("/_plumix/og/preview")).assertStatus(404);
    (await harness.fetch("/_plumix/og/preview/0.svg")).assertStatus(404);
  });
});
