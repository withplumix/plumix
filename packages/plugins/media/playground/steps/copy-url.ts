import type { StepFixtures } from "../../../../admin/verify/steps.js";

/** Copying a seeded item's URL says "Copied", then offers "Copy" again. */
export default async function copyUrl({
  page,
  context,
  expect,
  seeded,
}: StepFixtures): Promise<void> {
  const [name] = seeded.media ?? [];
  if (name === undefined) {
    throw new Error("No media to open: run with --seed.");
  }
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByTestId("media-library-search").fill(name);
  const cards = page.locator(
    "[data-testid='media-library-grid'] > [data-testid^='media-card-']",
  );
  await expect(cards).toHaveCount(1);
  await cards.first().click();
  const copy = page.getByTestId("media-detail-copy");

  await copy.click();

  await expect(copy).toHaveText("Copied");
  await expect(copy).toHaveText("Copy");
}
