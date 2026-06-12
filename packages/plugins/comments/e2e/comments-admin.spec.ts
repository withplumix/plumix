import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { factoriesFor } from "plumix/test";
import { openPlaygroundDb } from "plumix/test/playwright";

import { commentFactory } from "../src/test/factories.js";

// The public-facing render of an approved comment is covered in-process by
// the dispatcher-harness render tests (plumix dev serves the admin SPA for
// public routes). This suite exercises the admin moderation queue, which
// runs under plumix dev like the other plugin admin e2es.
let pendingId = 0;

test.beforeAll(async () => {
  const db = await openPlaygroundDb({
    cwd: resolve(process.cwd(), "playground"),
  });
  const factories = factoriesFor(db);
  const author = await factories.user.create({ email: "author@example.test" });
  const entry = await factories.entry.create({
    type: "post",
    slug: "moderate-me",
    title: "Moderate me",
    authorId: author.id,
    status: "published",
  });
  const comment = await commentFactory.transient({ db }).create({
    entryId: entry.id,
    status: "pending",
    authorName: "Pending Pat",
    bodyMd: "please review me",
  });
  pendingId = comment.id;
});

test("moderator approves a pending comment from the queue", async ({
  page,
}) => {
  await page.goto("pages/comments");
  await expect(page.getByTestId("comments-shell")).toBeVisible();

  // Pending is the default tab; the seeded comment is listed.
  const row = page.getByTestId(`comment-row-${String(pendingId)}`);
  await expect(row).toBeVisible();

  await page.getByTestId(`comment-approve-${String(pendingId)}`).click();

  // It leaves the pending queue and shows under Approved.
  await expect(row).toBeHidden();
  await page.getByTestId("comments-tab-approved").click();
  await expect(
    page.getByTestId(`comment-row-${String(pendingId)}`),
  ).toBeVisible();
});
