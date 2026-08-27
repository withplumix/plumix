// Worker-driven plugin e2e. Runs against the real og playground at
// `../playground` via `plumix dev`, seeded by globalSetup with an admin user +
// storageState carrying the session cookie. Nothing is mocked: the meta box
// has to reach the editor through the manifest, the field renderer through the
// plugin chunk, and the card through the real engine and the real oRPC call —
// none of which a unit test can stand in for.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "plumix/test/playwright";

const fixtures = JSON.parse(
  readFileSync(resolve(process.cwd(), "e2e-fixtures.json"), "utf8"),
) as { readonly draftId: number };

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
