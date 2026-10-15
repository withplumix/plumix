import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { factoriesFor } from "@plumix/core/test";
import { actingAs, openPlaygroundDb } from "@plumix/core/test/playwright";

/** The theme's `page` template renders each fixture by its slug. */
const FIXTURE_SLUGS = [
  "auth",
  "islands",
  "islands-nested",
  "islands-raw",
  "strategies",
] as const;

/**
 * Anchors on `process.cwd()` because playwright's storageState reader
 * resolves from it too, so the written and read files always match.
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
  // The account the playground's `fixture` sign-in method proves.
  await factories.admin.create({ email: "fixture@example.test" });
  const author = await factories.user.create({});
  for (const slug of FIXTURE_SLUGS) {
    await factories.entry.create({
      type: "page",
      slug,
      title: slug,
      authorId: author.id,
      status: "published",
      publishedAt: new Date(),
    });
  }
}
