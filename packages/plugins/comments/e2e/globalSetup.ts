import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { factoriesFor } from "plumix/test";
import { actingAs, openPlaygroundDb } from "plumix/test/playwright";

import { commentFactory } from "../src/test/factories.js";

const NOJS_SLUG = "comment-without-javascript";
const NOJS_EMAIL = "grace@example.test";

// All e2e seeding happens here — once, in the quiet window after the worker
// boots but before any spec drives it. Seeding from a spec races the live
// worker for the D1 write lock and re-collides on unique indexes when a
// retry runs it again. The specs read the seeded ids back from
// e2e-fixtures.json and never touch the database; a retry gets these rows
// back from the rig's baseline restore, not from re-seeding.
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
  // The playground runs the default `first_time` policy, under which a
  // brand-new address's first comment is held and never reaches the
  // thread. One approved comment from the address that spec posts under
  // is what lets its submission be visible on the page it lands back on.
  await commentFactory.transient({ db }).create({
    entryId: nojs.id,
    status: "approved",
    authorName: "Grace Hopper",
    authorEmail: NOJS_EMAIL,
    bodyMd: "already approved",
  });

  const bulkEntry = await factories.entry.create({
    type: "post",
    title: "Bulk target",
    authorId: author.id,
    status: "published",
  });
  const seed = commentFactory.transient({ db });
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
    }),
    "utf8",
  );
}
