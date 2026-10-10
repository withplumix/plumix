import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { factoriesFor } from "plumix/test";
import { actingAs, openPlaygroundDb } from "plumix/test/playwright";

import { commentFactory } from "../src/test/factories.js";

const NOJS_SLUG = "comment-without-javascript";
const NOJS_EMAIL = "grace@example.test";
const LOAD_MORE_SLUG = "older-comments";
/**
 * One root more than the default `rootsPerPage`, so exactly the oldest
 * is left for the load-more button to fetch.
 */
const LOAD_MORE_ROOTS = 21;

/**
 * Seeding from a spec races the live worker for the D1 write lock and
 * re-collides on unique indexes on retry, so all seeding happens here.
 */
export default async function globalSetup(): Promise<void> {
  const db = await openPlaygroundDb({
    cwd: resolve(process.cwd(), "playground"),
  });
  const { storageState } = await actingAs(db, "admin");
  await writeFile(
    resolve(process.cwd(), "storageState.json"),
    JSON.stringify(storageState, null, 2),
    "utf8",
  );

  const factories = factoriesFor(db);
  const author = await factories.user.create({});
  const single = await factories.entry.create({
    type: "post",
    title: "Moderate me",
    authorId: author.id,
    status: "published",
  });
  const seed = commentFactory.transient({ db });
  const pending = await commentFactory.transient({ db }).create({
    entryId: single.id,
    status: "pending",
    authorName: "Pending Pat",
    bodyMd: "please review me",
  });

  // The post the no-JavaScript spec comments on. An explicit slug because
  // the factory's default carries a timestamp, and the spec navigates to
  // the permalink by name.
  const nojs = await factories.entry.create({
    type: "post",
    title: "Comment without JavaScript",
    slug: NOJS_SLUG,
    authorId: author.id,
    status: "published",
  });
  // Under the `first_time` policy a new address's first comment is held, so
  // the no-JS spec's address needs one approved comment to show its post.
  await commentFactory.transient({ db }).create({
    entryId: nojs.id,
    status: "approved",
    authorName: "Grace Hopper",
    authorEmail: NOJS_EMAIL,
    bodyMd: "already approved",
  });

  const loadMore = await factories.entry.create({
    type: "post",
    title: "Older comments",
    slug: LOAD_MORE_SLUG,
    authorId: author.id,
    status: "published",
  });
  // Distinct days, oldest first, so the keyset page order is the seed
  // order and the first root seeded is the one past the first page.
  const seedRoot = (day: number) =>
    seed.create({
      entryId: loadMore.id,
      status: "approved",
      bodyMd: `older root ${String(day)}`,
      createdAt: new Date(Date.UTC(2026, 0, day)),
    });
  const oldestRoot = await seedRoot(1);
  for (let day = 2; day <= LOAD_MORE_ROOTS; day++) {
    await seedRoot(day);
  }

  const bulkEntry = await factories.entry.create({
    type: "post",
    title: "Bulk target",
    authorId: author.id,
    status: "published",
  });
  const first = await seed.create({ entryId: bulkEntry.id, status: "pending" });
  const second = await seed.create({
    entryId: bulkEntry.id,
    status: "pending",
  });

  await writeFile(
    resolve(process.cwd(), "e2e-fixtures.json"),
    JSON.stringify({
      nojsSlug: NOJS_SLUG,
      nojsEmail: NOJS_EMAIL,
      pendingId: pending.id,
      bulkEntryId: bulkEntry.id,
      bulkIds: [first.id, second.id],
      loadMoreSlug: LOAD_MORE_SLUG,
      oldestRootId: oldestRoot.id,
    }),
    "utf8",
  );
}
