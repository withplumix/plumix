import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { factoriesFor } from "plumix/test";
import { actingAs, openPlaygroundDb } from "plumix/test/playwright";

// All e2e seeding happens here — once, in the quiet window after the worker
// boots but before any spec drives it. Seeding from a spec races the live
// worker for the D1 write lock, and a retry would re-insert against a
// baseline that does not rewind `sqlite_sequence`, so the row would come back
// under a different id than the spec was written against. The spec reads the
// id out of e2e-fixtures.json and never touches the database; a retry gets the
// row back from the rig's baseline restore.
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
  const post = await factories.entry.create({
    type: "post",
    title: "Hello",
    slug: "hello",
    excerpt: "The excerpt a search engine would fall back to.",
    status: "published",
    authorId: author.id,
  });

  await writeFile(
    resolve(process.cwd(), "e2e-fixtures.json"),
    JSON.stringify({ postId: post.id }),
    "utf8",
  );
}
