import { resolve } from "node:path";

import type { BlockNode } from "@plumix/core/blocks";
import type { EditorEntryRef } from "@plumix/core/test/playwright";
import { factoriesFor } from "@plumix/core/test";
import { openPlaygroundDb } from "@plumix/core/test/playwright";

/** A draft page of `blocks`, its own per test so specs never share one. */
export async function seedPage(
  blocks: readonly BlockNode[],
): Promise<EditorEntryRef> {
  const db = await openPlaygroundDb({
    cwd: resolve(process.cwd(), "playground"),
  });
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
