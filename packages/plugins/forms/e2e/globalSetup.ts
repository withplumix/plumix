import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { factoriesFor } from "plumix/test";
import { actingAs, openPlaygroundDb } from "plumix/test/playwright";

import { submissionFactory } from "../src/test/factories.js";

// All e2e seeding happens here — once, in the quiet window after the
// worker boots but before any spec drives it. The specs never write to
// the database: they submit the form the seeded page carries, and the
// inbox spec moves the submissions seeded below, reading their ids back
// from e2e-fixtures.json.
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
    ["guarded", "Ask us something"],
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

  const seed = submissionFactory.transient({ db });
  const answered = await seed.create({
    formSlug: "contact",
    serial: 1,
    answers: { name: "Ada Lovelace", email: "ada@example.test" },
    labels: {
      name: { label: "Your name" },
      email: { label: "Email address" },
    },
    userAgent: "e2e/1.0",
  });
  // A form the config no longer declares: the inbox reads its columns
  // off this row's own snapshot, so it stays readable regardless.
  const retired = await seed.create({
    formSlug: "retired",
    serial: 1,
    answers: { question: "Still readable" },
    labels: { question: { label: "What we used to ask" } },
    handlerError: "SMTP refused",
  });

  await writeFile(
    resolve(process.cwd(), "e2e-fixtures.json"),
    JSON.stringify({ answeredId: answered.id, retiredId: retired.id }),
    "utf8",
  );
}
