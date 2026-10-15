import { resolve } from "node:path";
import type { Fixtures, PlaywrightTestArgs } from "@playwright/test";

import type { BlockNode } from "@plumix/core/blocks";
import type { Factories } from "@plumix/core/test";
import type { Editor } from "@plumix/core/test/playwright";
import { factoriesFor } from "@plumix/core/test";
import { actingAs, openPlaygroundDb } from "@plumix/core/test/playwright";

export interface Seed {
  readonly factories: Factories;
  /** The admin the page is signed in as. */
  readonly authorId: number;
}

/**
 * For `test.extend`: each test signs in as its own admin, so its drafts are
 * its own.
 */
export const seedFixture: Fixtures<{ seed: Seed }, object, PlaywrightTestArgs> =
  {
    seed: [
      async ({ context }, use) => {
        const db = await openPlaygroundDb({
          cwd: resolve(process.cwd(), "playground"),
        });
        const { user, storageState } = await actingAs(db, "admin");
        await context.addCookies([...storageState.cookies]);
        await use({ factories: factoriesFor(db), authorId: user.id });
        db.$client.close();
      },
      { auto: true },
    ],
  };

/** Opens a draft post of `blocks`, made by the `entry` factory. */
export async function openPost(
  editor: Editor,
  seed: Seed,
  blocks: readonly BlockNode[],
): Promise<void> {
  const post = await seed.factories.entry.create({
    type: "post",
    authorId: seed.authorId,
    content: { version: "plumix.v2", blocks: [...blocks] },
  });
  await editor.open(post);
}
