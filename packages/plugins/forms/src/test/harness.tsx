import type { AnyPluginDescriptor } from "plumix";
import { archive, defineTheme, entry, fallback } from "plumix";
import { BlockRenderer } from "plumix/blocks/renderer";
import { definePlugin } from "plumix/plugin";
import { createDispatcherHarness } from "plumix/test";

import { applyFormsSchema } from "./db.js";

export type FormsHarness = Awaited<ReturnType<typeof createDispatcherHarness>>;

const blog = definePlugin("test_blog", (ctx) => {
  ctx.registerEntryType("post", {
    label: "Posts",
    isPublic: true,
    hasArchive: true,
    rewrite: { slug: "posts" },
  });
});

// A theme that puts the entry's blocks on the page — the only way the
// form block's own markup reaches a visitor.
const theme = defineTheme({
  templates: [
    fallback(() => null),
    entry(({ data }) =>
      data.entry.contentBlocks ? (
        <BlockRenderer content={data.entry.contentBlocks} />
      ) : null,
    ),
    // The same blocks on a page that is not one entry's — what a listing
    // rendering an excerpt does, and the only way to reach the form block
    // where there is no entry to bind.
    archive(({ data }) =>
      data.entries.map((one) =>
        one.contentBlocks ? (
          <BlockRenderer key={one.id} content={one.contentBlocks} />
        ) : null,
      ),
    ),
  ],
});

export async function createFormsHarness(
  plugins: readonly AnyPluginDescriptor[],
): Promise<FormsHarness> {
  const harness = await createDispatcherHarness({
    plugins: [blog, ...plugins],
    theme,
  });
  await applyFormsSchema(harness.db);
  return harness;
}

/** The seeded entry, so a caller can name the id its form binds. */
export async function seedPageWithForm(
  harness: FormsHarness,
  slug: string,
  path = "page-with-form",
): Promise<{ readonly id: number }> {
  const author = await harness.seedUser("admin");
  return harness.factory.entry.create({
    type: "post",
    slug: path,
    title: "Get in touch",
    content: {
      version: "plumix.v2",
      blocks: [{ id: "form-node", name: "forms/form", attrs: { slug } }],
    },
    status: "published",
    authorId: author.id,
    publishedAt: new Date(),
  });
}
