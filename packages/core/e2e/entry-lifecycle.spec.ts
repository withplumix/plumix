import { resolve } from "node:path";

import type { Factories } from "@plumix/core/test";
import { factoriesFor } from "@plumix/core/test";
import {
  actingAs,
  test as base,
  expect,
  openPlaygroundDb,
} from "@plumix/core/test/playwright";

import { holdRequests } from "./support/hold-requests.js";

interface Seed {
  readonly factories: Factories;
  /** The admin the page is signed in as. */
  readonly authorId: number;
}

/** Top-level blocks by name, as an entry stores them. */
const content = (...names: readonly string[]) => ({
  version: "plumix.v2" as const,
  blocks: names.map((name, index) => ({ id: `seeded-${String(index)}`, name })),
});

/** Each test signs in as its own admin, so its drafts are its own. */
const test = base.extend<{ seed: Seed }>({
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
});

test("a new entry takes a block in its empty canvas and stores it", async ({
  editor,
}) => {
  await editor.create("post");
  expect(await editor.canvas.blocks()).toEqual([]);

  await editor.insert("core/separator");
  await editor.save();

  expect(await editor.canvas.blocks()).toEqual(["core/separator"]);
  await editor.reload();
  expect((await editor.stored()).map(({ name }) => name)).toEqual([
    "core/separator",
  ]);
  expect(await editor.canvas.blocks()).toEqual(["core/separator"]);
});

test("the Back button flushes the last edit before it leaves", async ({
  editor,
  page,
  seed,
}) => {
  const post = await seed.factories.entry.create({
    type: "post",
    authorId: seed.authorId,
  });
  await editor.open(post);

  // Clicked inside autosave's debounce, so the edit is still pending.
  await editor.insert("core/separator");
  await page.getByTestId("plumix-editor-back").click();
  await page.waitForURL(/\/entries\/[^/]+$/);

  await editor.open(post);
  expect((await editor.stored()).map(({ name }) => name)).toEqual([
    "core/separator",
  ]);
  expect(await editor.canvas.blocks()).toEqual(["core/separator"]);
});

test("leaving with an unsaved edit prompts, and staying stores it", async ({
  editor,
  page,
  seed,
}) => {
  const post = await seed.factories.entry.create({
    type: "post",
    authorId: seed.authorId,
  });
  await editor.open(post);
  // A held write keeps the edit unsaved for as long as the test needs.
  const release = await holdRequests(page, "**/_plumix/rpc/entry/update");
  await editor.insert("core/separator");

  // The page's script is paused while the prompt is open, so the flush lands
  // once the author chooses to stay.
  let prompt: string | undefined;
  page.once("dialog", (dialog) => {
    prompt = dialog.type();
    void dialog.dismiss();
  });
  await page.evaluate(() => {
    location.assign("/");
  });
  expect(prompt).toBe("beforeunload");
  release();
  await editor.save();

  await editor.reload();
  expect((await editor.stored()).map(({ name }) => name)).toEqual([
    "core/separator",
  ]);
  expect(await editor.canvas.blocks()).toEqual(["core/separator"]);
});

test("discarding the draft puts the published blocks back", async ({
  editor,
  page,
  seed,
}) => {
  const post = await seed.factories.entry.create({
    type: "post",
    authorId: seed.authorId,
    status: "published",
    content: content("core/separator"),
  });
  await editor.open(post);
  await editor.insert("core/code");
  await editor.save();
  await expect(page.getByTestId("editor-unpublished-changes")).toBeVisible();

  await page.getByTestId("editor-draft-discard").click();
  await page.getByTestId("editor-draft-discard-confirm").click();

  await expect(page.getByTestId("editor-unpublished-changes")).toBeHidden();
  // The editor remounts on the published row, so a read can meet the old
  // canvas as it detaches.
  await expect(async () => {
    expect(await editor.canvas.blocks()).toEqual(["core/separator"]);
  }).toPass();
  await editor.reload();
  expect(await editor.stored()).toEqual(content("core/separator").blocks);
  expect(await editor.canvas.blocks()).toEqual(["core/separator"]);
});

test("restoring a revision from its preview stores that revision's blocks", async ({
  editor,
  page,
  seed,
}) => {
  const post = await seed.factories.entry.create({
    type: "post",
    authorId: seed.authorId,
    status: "published",
    content: content("core/separator"),
  });
  const earlier = content("core/code", "core/separator");
  // A revision is an entry of type `revision` whose slug names its entry.
  const revision = await seed.factories.entry.create({
    authorId: seed.authorId,
    type: "revision",
    slug: `revision:${String(post.id)}:seeded`,
    status: "published",
    content: earlier,
  });
  await editor.open(post);

  await page.getByTestId("revisions-sheet-trigger").click();
  await page
    .getByTestId(`revisions-sheet-item-${String(revision.id)}-select`)
    .click();
  const banner = page.getByTestId("revision-preview-banner");
  await expect(banner).toBeVisible();
  await banner.getByTestId("revision-preview-restore").click();

  await expect(banner).toBeHidden();
  await expect(async () => {
    expect(await editor.canvas.blocks()).toEqual([
      "core/code",
      "core/separator",
    ]);
  }).toPass();
  await editor.reload();
  expect(await editor.stored()).toEqual(earlier.blocks);
  expect(await editor.canvas.blocks()).toEqual(["core/code", "core/separator"]);
});
