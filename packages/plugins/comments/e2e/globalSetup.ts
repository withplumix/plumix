import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { factoriesFor } from "plumix/test";
import { actingAs, openPlaygroundDb } from "plumix/test/playwright";

import { commentFactory } from "../src/test/factories.js";

// Row *creation* happens here — once, in the quiet window after the worker
// boots but before any spec drives it. Creating rows from a spec re-collides
// on unique indexes when a retry runs it again. The specs read the seeded ids
// back from e2e-fixtures.json; their only write is resetting their own
// fixtures' status, which updates existing rows. That still takes the D1
// write lock while the worker is live, which is what `openPlaygroundDb`'s
// `busy_timeout` is there to absorb.
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
      pendingId: pending.id,
      bulkEntryId: bulkEntry.id,
      bulkIds: [first.id, second.id],
    }),
    "utf8",
  );
}
