import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { factoriesFor } from "plumix/test";
import { actingAs, openPlaygroundDb } from "plumix/test/playwright";

/**
 * Seeds before any spec runs: seeding from a spec races the worker for the D1
 * write lock, and a retry would reinsert under a new id.
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
  // A draft, deliberately: the card route serves published entries only, so a
  // preview that renders this one cannot have come from a stored card.
  const draft = await factories.entry.create({
    type: "post",
    title: "Never published",
    slug: "never-published",
    status: "draft",
    authorId: author.id,
  });

  await writeFile(
    resolve(process.cwd(), "e2e-fixtures.json"),
    JSON.stringify({ draftId: draft.id }),
    "utf8",
  );
}
