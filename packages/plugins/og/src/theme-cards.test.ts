import type { TemplateData } from "plumix";
import type { DispatcherHarness } from "plumix/test";
import { defineTheme, fallback, memoryStorage } from "plumix";
import { definePlugin } from "plumix/plugin";
import { createDispatcherHarness } from "plumix/test";
import { describe, expect, test } from "vitest";

import type { CardArgs, CardRule } from "./card.js";
import { cardKey } from "./card-key.js";
import { card } from "./card.js";
import { og } from "./index.js";
import { createFakeRenderer } from "./test/fake-renderer.js";

const testBlog = definePlugin("test_blog", {
  setup: (ctx) => {
    ctx.registerEntryType("post", {
      label: "Posts",
      isPublic: true,
      rewrite: { slug: "posts" },
    });
    ctx.registerEntryType("page", { label: "Pages", isPublic: true });
  },
});

interface HarnessOptions {
  readonly cards?: readonly CardRule[];
  readonly fonts?: readonly string[];
}

async function createHarness(
  options: HarnessOptions = {},
): Promise<DispatcherHarness> {
  const face = new Uint8Array([0x00, 0x01, 0x00, 0x00]);
  return createDispatcherHarness({
    plugins: [
      testBlog,
      og({ renderer: createFakeRenderer().renderer, fonts: options.fonts }),
    ],
    storage: memoryStorage().connect({}),
    assets: { fetch: () => Promise.resolve(new Response(face)) },
    theme: defineTheme({
      templates: [fallback(() => null)],
      ogCards: options.cards,
    }),
  });
}

async function seedEntry(
  harness: DispatcherHarness,
  overrides: {
    readonly title?: string;
    readonly type?: string;
    readonly slug?: string;
  } = {},
): Promise<number> {
  const author = await harness.factory.user.create({});
  const entry = await harness.factory.entry.create({
    type: overrides.type ?? "post",
    title: overrides.title ?? "Hello World",
    ...(overrides.slug === undefined ? {} : { slug: overrides.slug }),
    status: "published",
    authorId: author.id,
  });
  return entry.id;
}

function cardPath(id: number): string {
  return `/_plumix/og/entry/${String(id)}.svg`;
}

function siteTitle(settings: CardArgs<TemplateData>["settings"]): string {
  const title = settings?.site?.title;
  return typeof title === "string" ? title : "";
}

describe("cards a theme declares", () => {
  test("outrank the plugin's default template", async () => {
    const harness = await createHarness({
      cards: [
        card.fallback().define({
          key: ({ data }) => cardKey.of("themed", data.kind),
          render: () => ({ type: "text", text: "Themed Card" }),
        }),
      ],
    });
    const id = await seedEntry(harness);

    const body = await (await harness.fetch(cardPath(id))).text();

    expect(body).toContain("Themed Card");
    expect(body).not.toContain("Hello World");
  });

  test("resolve per page kind, most specific first", async () => {
    const cards = [
      card.forEntryType("post").define({
        key: ({ data }) => cardKey.entry(data.entry),
        render: () => ({ type: "text", text: "Post Card" }),
      }),
      card.entry().define({
        key: ({ data }) => cardKey.entry(data.entry),
        render: () => ({ type: "text", text: "Entry Card" }),
      }),
      card.fallback().define({
        key: ({ data }) => cardKey.of("fallback", data.kind),
        render: () => ({ type: "text", text: "Fallback Card" }),
      }),
    ];
    const harness = await createHarness({ cards });
    const post = await seedEntry(harness, { type: "post" });
    const page = await seedEntry(harness, { type: "page", title: "About" });

    const served = async (id: number): Promise<string> =>
      (await harness.fetch(cardPath(id))).text();

    expect(await served(post)).toContain("Post Card");
    expect(await served(page)).toContain("Entry Card");
  });

  test("narrow to one entry through the same selectors templates use", async () => {
    const harness = await createHarness({
      cards: [
        card
          .forEntryType("post")
          .slug("hello-world")
          .define({
            key: ({ data }) => cardKey.entry(data.entry),
            render: () => ({ type: "text", text: "The Announcement" }),
          }),
        card.forEntryType("post").define({
          key: ({ data }) => cardKey.entry(data.entry),
          render: () => ({ type: "text", text: "Any Post" }),
        }),
      ],
    });
    const announcement = await seedEntry(harness, { slug: "hello-world" });
    const other = await seedEntry(harness, { slug: "something-else" });

    const served = async (id: number): Promise<string> =>
      (await harness.fetch(cardPath(id))).text();

    expect(await served(announcement)).toContain("The Announcement");
    expect(await served(other)).toContain("Any Post");
  });

  test("receive the narrowed entry in both callbacks", async () => {
    const harness = await createHarness({
      cards: [
        card.forEntryType("post").define({
          // Both callbacks read `data.entry` — typed from the registry's `post`
          // projection, not from the `TemplateData` union.
          key: ({ data }) => cardKey.entry(data.entry, data.entry.slug),
          render: ({ data }) => ({
            type: "text",
            text: data.entry.title.toUpperCase(),
          }),
        }),
      ],
    });
    const id = await seedEntry(harness, { title: "Hello World" });

    const body = await (await harness.fetch(cardPath(id))).text();

    expect(body).toContain("HELLO WORLD");
  });

  test("read the template deps they declare", async () => {
    const harness = await createHarness({
      cards: [
        card.fallback().define({
          settings: ["site"],
          key: ({ settings }) => cardKey.of("site", siteTitle(settings)),
          render: ({ settings }) => ({
            type: "text",
            text: siteTitle(settings),
          }),
        }),
      ],
    });
    await harness.factory.setting.create({
      group: "site",
      key: "title",
      value: "Example Site",
    });
    const id = await seedEntry(harness);

    const body = await (await harness.fetch(cardPath(id))).text();

    expect(body).toContain("Example Site");
  });
});

describe("what a card's key covers", () => {
  const etagOf = async (options: HarnessOptions): Promise<string | null> => {
    const harness = await createHarness(options);
    const id = await seedEntry(harness);
    return (await harness.fetch(cardPath(id))).headers.get("etag");
  };

  // Every card here keys on a constant, so the ETag is a statement about the
  // card itself rather than about the entry behind it.
  const firstDesign = (): CardRule =>
    card.fallback().define({
      key: () => cardKey.of("fixed"),
      render: () => ({ type: "text", text: "First Design" }),
    });

  test("an edited card lands on a fresh key", async () => {
    const before = await etagOf({ cards: [firstDesign()] });

    const after = await etagOf({
      cards: [
        card.fallback().define({
          key: () => cardKey.of("fixed"),
          render: () => ({ type: "text", text: "Second Design" }),
        }),
      ],
    });

    expect(after).not.toBe(before);
  });

  test("an edited stylesheet lands on a fresh key", async () => {
    const before = await etagOf({ cards: [firstDesign()] });

    const after = await etagOf({
      cards: [
        card.fallback().define({
          styles: [".plumix-og-card { color: red }"],
          key: () => cardKey.of("fixed"),
          render: () => ({ type: "text", text: "First Design" }),
        }),
      ],
    });

    expect(after).not.toBe(before);
  });

  test("an unedited card keeps its key", async () => {
    const before = await etagOf({ cards: [firstDesign()] });

    const after = await etagOf({ cards: [firstDesign()] });

    expect(after).toBe(before);
  });

  test("a changed font set lands on a fresh key", async () => {
    const before = await etagOf({ cards: [firstDesign()] });

    const after = await etagOf({
      cards: [firstDesign()],
      fonts: ["/fonts/Inter-SemiBold.ttf"],
    });

    expect(after).not.toBe(before);
  });
});

describe("what the builders refuse to compile", () => {
  test("an unregistered entry type and a card with no key", () => {
    // @ts-expect-error - "nope" is not a registered entry type
    card.forEntryType("nope");
    // @ts-expect-error - "nope" is not a registered taxonomy
    card.forTermTaxonomy("nope");
    // @ts-expect-error - every rule has to say what its card reads
    card.fallback().define({ render: () => ({ type: "text", text: "x" }) });
    expect(card.forEntryType("post")).toBeDefined();
  });
});
