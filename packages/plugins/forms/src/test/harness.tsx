import type { AnyPluginDescriptor, PlumixEnv } from "plumix";
import type { BlockSpec } from "plumix/blocks";
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
const themeWith = (blocks: readonly BlockSpec[]) =>
  defineTheme({
    blocks,
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

export interface FormsHarnessOptions {
  /** What the site's own theme contributes — see `defineTheme`'s `blocks`. */
  readonly themeBlocks?: readonly BlockSpec[];
  /** Runtime bindings, for a config slot that resolves a secret from them. */
  readonly env?: PlumixEnv;
  /** The visitor's address, as a runtime adapter reports it to core. */
  readonly clientAddress?: string;
}

export async function createFormsHarness(
  plugins: readonly AnyPluginDescriptor[],
  options: FormsHarnessOptions = {},
): Promise<FormsHarness> {
  const harness = await createDispatcherHarness({
    plugins: [blog, ...plugins],
    theme: themeWith(options.themeBlocks ?? []),
    env: options.env,
    clientAddress: options.clientAddress,
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
