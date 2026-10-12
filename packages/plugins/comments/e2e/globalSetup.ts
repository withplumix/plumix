import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { factoriesFor } from "plumix/test";
import { actingAs, openPlaygroundDb } from "plumix/test/playwright";

import { commentFactory } from "../src/test/factories.js";

const NOJS_SLUG = "comment-without-javascript";
const NOJS_EMAIL = "grace@example.test";
const OLDER_PAGES_SLUG = "older-comments";
/** Three pages at the playground's `rootsPerPage` of 2, the last holding one. */
const OLDER_PAGES_ROOTS = 5;
const MAGIC_LINK_EMAIL = "magic@example.test";

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
  await factories.user.create({ email: MAGIC_LINK_EMAIL, role: "editor" });
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

  const olderPages = await factories.entry.create({
    type: "post",
    title: "Older comments",
    slug: OLDER_PAGES_SLUG,
    authorId: author.id,
    status: "published",
  });
  // Distinct days, oldest first, so the keyset page order is the reverse of
  // the seed order.
  for (let day = 1; day <= OLDER_PAGES_ROOTS; day++) {
    await seed.create({
      entryId: olderPages.id,
      status: "approved",
      bodyMd: `older root ${String(day)}`,
      createdAt: new Date(Date.UTC(2026, 0, day)),
    });
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
      olderPagesSlug: OLDER_PAGES_SLUG,
      magicLinkEmail: MAGIC_LINK_EMAIL,
    }),
    "utf8",
  );
}
