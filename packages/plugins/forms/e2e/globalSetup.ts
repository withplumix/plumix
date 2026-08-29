import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { factoriesFor } from "plumix/test";
import { actingAs, openPlaygroundDb } from "plumix/test/playwright";

// All e2e seeding happens here — once, in the quiet window after the
// worker boots but before any spec drives it. The specs never write:
// they submit the form the seeded page carries, which is the only write
// the suite makes.
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
  // `templated` carries no block: the theme's template renders the same
  // contact form itself, which is the only way to tell the two surfaces
  // apart in the browser.
  await factories.entry.create({
    type: "page",
    slug: "templated",
    title: "Contact us",
    authorId: author.id,
    status: "published",
    publishedAt: new Date(),
    content: { version: "plumix.v2", blocks: [] },
  });
  for (const [slug, title] of [
    ["contact", "Contact us"],
    ["survey", "Survey"],
    ["gated", "Pick a plan"],
  ] as const) {
    await factories.entry.create({
      type: "page",
      slug,
      title,
      authorId: author.id,
      status: "published",
      publishedAt: new Date(),
      content: {
        version: "plumix.v2",
        blocks: [{ id: `${slug}-form`, name: "forms/form", attrs: { slug } }],
      },
    });
  }
}
