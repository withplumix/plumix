import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { eq } from "plumix/db";
import { entries } from "plumix/schema";
import { expect, openPlaygroundDb, test } from "plumix/test/playwright";

const fixtures = JSON.parse(
  readFileSync(resolve(process.cwd(), "e2e-fixtures.json"), "utf8"),
) as { readonly draftId: number; readonly retitledId: number };

const FIELD = "meta-box-field-og_card_preview-input";

test("the editor previews the draft's card and names the chain link", async ({
  page,
}) => {
  await page.goto(`entries/posts/${String(fixtures.draftId)}/edit`);
  await page.getByTestId("plumix-tab-page").click();

  await expect(page.getByTestId("entry-meta-box-card_preview")).toBeVisible();
  // Registered through the plugin chunk. Without it the admin falls through to
  // its text-input fallback and this locator never resolves.
  await expect(page.getByTestId(FIELD)).toBeVisible();

  const image = page.getByTestId(`${FIELD}-image`);
  await expect(image).toBeVisible({ timeout: 30_000 });
  // Rendered on the spot and carried inline — not a URL into the bucket.
  await expect(image).toHaveAttribute("src", /^data:image\/png;base64,/);
  await expect(page.getByTestId(`${FIELD}-outcome`)).toContainText(
    "card generated from this entry",
  );
});

test("refresh renders the card again for the entry as it now stands", async ({
  page,
}) => {
  await page.goto(`entries/posts/${String(fixtures.retitledId)}/edit`);
  await page.getByTestId("plumix-tab-page").click();
  const image = page.getByTestId(`${FIELD}-image`);
  await expect(image).toBeVisible({ timeout: 30_000 });
  const before = await image.getAttribute("src");

  const db = await openPlaygroundDb({
    cwd: resolve(process.cwd(), "playground"),
  });
  await db
    .update(entries)
    .set({ title: "After the retitle" })
    .where(eq(entries.id, fixtures.retitledId));
  await page.getByTestId(`${FIELD}-refresh`).click();

  await expect(image).not.toHaveAttribute("src", before ?? "", {
    timeout: 30_000,
  });
  await expect(image).toHaveAttribute("src", /^data:image\/png;base64,/);
});
