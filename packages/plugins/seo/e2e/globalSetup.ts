import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { factoriesFor } from "plumix/test";
import { actingAs, openPlaygroundDb } from "plumix/test/playwright";

/**
 * Seeds before any spec runs: seeding from a spec races the worker for the D1
 * write lock, and a retry's re-insert gets a new id since `sqlite_sequence`
 * never rewinds.
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
