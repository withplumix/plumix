import { resolve } from "node:path";
import type { Page } from "@playwright/test";

import type { Factories } from "@plumix/core/test";
import { factoriesFor } from "@plumix/core/test";
import {
  actingAs,
  test as base,
  expect,
  openPlaygroundDb,
} from "@plumix/core/test/playwright";

import { holdRequests } from "./support/hold-requests.js";

const ENTRY_UPDATE = "/_plumix/rpc/entry/update";

interface Seed {
  readonly factories: Factories;
  /** The admin the page is signed in as. */
  readonly authorId: number;
}

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

/**
 * In order: `sent` when an `entry.update` leaves the page, `stored` when it is
 * answered, `left` when the page navigates.
 */
function recordLeaving(page: Page): string[] {
  const events: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith(ENTRY_UPDATE)) events.push("sent");
  });
  page.on("requestfinished", (request) => {
    if (request.url().endsWith(ENTRY_UPDATE)) events.push("stored");
  });
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) events.push("left");
  });
  return events;
}

test("the Back button sends the pending edit before it leaves", async ({
  editor,
  page,
  seed,
}) => {
  const post = await seed.factories.entry.create({
    type: "post",
    authorId: seed.authorId,
  });
  await editor.open(post);
  const events = recordLeaving(page);

  await editor.insert("core/separator");
  events.push("back");
  await editor.back();

  // Sent after the click, so it was still waiting on autosave's debounce, and
  // stored before the editor left.
  expect(events).toEqual(["back", "sent", "stored", "left"]);
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
  const release = await holdRequests(page, `**${ENTRY_UPDATE}`);
  await editor.insert("core/separator");

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

test("leaving anyway still stores the pending edit", async ({
  editor,
  page,
  seed,
}) => {
  const post = await seed.factories.entry.create({
    type: "post",
    authorId: seed.authorId,
  });
  await editor.open(post);
  await editor.insert("core/separator");

  // Unloading takes autosave's debounce with it, so only the flush can store
  // the edit.
  page.once("dialog", (dialog) => void dialog.accept());
  await page.evaluate(() => {
    location.assign("/");
  });
  await page.waitForURL((url) => url.pathname === "/");

  await editor.open(post);
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
    content: {
      version: "plumix.v2",
      blocks: [{ id: "published-separator", name: "core/separator" }],
    },
  });
  await editor.open(post);
  await editor.insert("core/code");
  await editor.save();
  await expect(page.getByTestId("editor-unpublished-changes")).toBeVisible();

  await editor.discard();

  await expect(page.getByTestId("editor-unpublished-changes")).toBeHidden();
  expect(await editor.canvas.blocks()).toEqual(["core/separator"]);
  await editor.reload();
  expect(await editor.stored()).toEqual([
    { id: "published-separator", name: "core/separator" },
  ]);
  expect(await editor.canvas.blocks()).toEqual(["core/separator"]);
});

test("restoring a revision from its preview stores that revision's blocks", async ({
  editor,
  seed,
}) => {
  const post = await seed.factories.entry.create({
    type: "post",
    authorId: seed.authorId,
    status: "published",
    content: {
      version: "plumix.v2",
      blocks: [{ id: "live-separator", name: "core/separator" }],
    },
  });
  const revision = await seed.factories.revision
    .transient({ of: post })
    .create({
      content: {
        version: "plumix.v2",
        blocks: [
          { id: "earlier-code", name: "core/code" },
          { id: "earlier-separator", name: "core/separator" },
        ],
      },
    });
  await editor.open(post);

  await editor.restoreRevision(revision);

  expect(await editor.canvas.blocks()).toEqual(["core/code", "core/separator"]);
  await editor.reload();
  expect(await editor.stored()).toEqual([
    { id: "earlier-code", name: "core/code" },
    { id: "earlier-separator", name: "core/separator" },
  ]);
  expect(await editor.canvas.blocks()).toEqual(["core/code", "core/separator"]);
});
