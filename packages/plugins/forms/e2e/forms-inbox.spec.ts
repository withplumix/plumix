// The submissions inbox, driven in a real admin. What this reaches that
// the component suite cannot: the plugin's admin chunk actually resolving
// `SubmissionsShell` for the page the plugin registered, and the RPC
// answering it behind the capability an editor holds.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "plumix/test/playwright";

// Seeded by globalSetup, once per suite run. The rig rewinds the database
// once per attempt rather than between tests, so each test moves its own
// fixture and leaves the other alone.
interface Fixtures {
  readonly answeredId: number;
  readonly retiredId: number;
}
const fixtures = JSON.parse(
  readFileSync(resolve(process.cwd(), "e2e-fixtures.json"), "utf8"),
) as Fixtures;

const INBOX = "pages/form-submissions";

test("an administrator reads a submission under its own labels", async ({
  page,
}) => {
  await page.goto(INBOX);
  await expect(page.getByTestId("forms-submissions-shell")).toBeVisible();

  // Filter to the retired form first: the columns come from the rows on
  // the page, so without this the assertion below would turn on how many
  // submissions the rest of the suite has made.
  await page.getByTestId("forms-form-filter").click();
  await page.getByTestId("forms-form-filter-retired").click();

  const id = String(fixtures.retiredId);
  await expect(page.getByTestId(`forms-submission-row-${id}`)).toBeVisible();
  // The form is gone from the config; the row still names its question.
  await expect(page.getByTestId("forms-column-question")).toHaveText(
    "What we used to ask",
  );
  // And the failed handler is findable without opening it.
  await expect(page.getByTestId(`forms-failed-${id}`)).toBeVisible();

  await page.getByTestId(`forms-open-${id}`).click();
  await expect(page.getByTestId("forms-detail-answers")).toContainText(
    "Still readable",
  );
  await expect(page.getByTestId("forms-detail-handler-error")).toContainText(
    "SMTP refused",
  );
});

test("an administrator archives a submission and notes what they did", async ({
  page,
}) => {
  await page.goto(INBOX);
  await page.getByTestId("forms-form-filter").click();
  await page.getByTestId("forms-form-filter-contact").click();
  const id = String(fixtures.answeredId);
  await page.getByTestId(`forms-open-${id}`).click();
  await expect(page.getByTestId("forms-detail")).toBeVisible();

  await page.getByTestId("forms-detail-note").fill("Rang back Tuesday");
  await page.getByTestId("forms-detail-note-save").click();
  await page.getByTestId("forms-detail-status-archived").click();

  // Both stuck: the archived tab has it, carrying the note.
  await page.getByTestId("forms-status-tab-archived").click();
  await expect(page.getByTestId(`forms-submission-row-${id}`)).toBeVisible();
  await page.getByTestId(`forms-open-${id}`).click();
  await expect(page.getByTestId("forms-detail-note")).toHaveValue(
    "Rang back Tuesday",
  );
});

test("an administrator exports what the filters name", async ({ page }) => {
  await page.goto(INBOX);
  await page.getByTestId("forms-form-filter").click();
  await page.getByTestId("forms-form-filter-retired").click();
  await expect(
    page.getByTestId(`forms-submission-row-${String(fixtures.retiredId)}`),
  ).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("forms-export-csv").click(),
  ]);

  expect(download.suggestedFilename()).toBe("submissions-retired.csv");
  const file = await download.createReadStream();
  const body = (await file.toArray()).join("");
  // The retired form's own question heads the column, and the answer is
  // under it — the export reads the row's snapshot, not the registry.
  expect(body).toContain("What we used to ask");
  expect(body).toContain("Still readable");
  expect(body).not.toContain("Ada Lovelace");
});
