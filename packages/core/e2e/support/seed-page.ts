import { resolve } from "node:path";

import type { BlockNode } from "@plumix/core/blocks";
import type { EditorEntryRef } from "@plumix/core/test/playwright";
import { factoriesFor } from "@plumix/core/test";
import { openPlaygroundDb } from "@plumix/core/test/playwright";

const playgroundDb = () =>
  openPlaygroundDb({ cwd: resolve(process.cwd(), "playground") });

/** A draft page of `blocks`, its own per test so specs never share one. */
export async function seedPage(
  blocks: readonly BlockNode[],
): Promise<EditorEntryRef> {
  const db = await playgroundDb();
  try {
    const factories = factoriesFor(db);
    const author = await factories.user.create({});
    const page = await factories.entry.create({
      type: "page",
      authorId: author.id,
      content: { version: "plumix.v2", blocks },
    });
    return { type: "page", id: page.id };
  } finally {
    db.$client.close();
  }
}

/** A `core/code` block, told apart from the others by its text. */
export const code = (id: string): BlockNode => ({
  id,
  name: "core/code",
  attrs: { text: id },
});

/**
 * A published library image served from `url`. With no storage configured,
 * a media row's storage key is the URL it serves from.
 */
export async function seedImage(url: string): Promise<number> {
  const db = await playgroundDb();
  try {
    const factories = factoriesFor(db);
    const author = await factories.admin.create({});
    const image = await factories.entry.create({
      type: "media",
      title: "Fill",
      status: "published",
      authorId: author.id,
      meta: {
        mime: "image/png",
        size: 68,
        storageKey: url,
        originalName: "fill.png",
        alt: "Fill",
      },
    });
    return image.id;
  } finally {
    db.$client.close();
  }
}
