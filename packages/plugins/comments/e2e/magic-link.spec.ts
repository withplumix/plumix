import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "plumix/test/playwright";

interface Fixtures {
  readonly magicLinkEmail: string;
}
const fixtures = JSON.parse(
  readFileSync(resolve(process.cwd(), "e2e-fixtures.json"), "utf8"),
) as Fixtures;

test.use({ storageState: { cookies: [], origins: [] } });

test("signing in follows the magic link the mailbox caught", async ({
  page,
  mailbox,
}) => {
  const to = fixtures.magicLinkEmail;
  await mailbox.clear();
  await page.goto("login");
  await page.getByTestId("login-email-input").fill(to);
  await page.getByTestId("login-magic-link-submit").click();
  await expect(page.getByTestId("login-magic-link-sent")).toBeVisible();

  const { props } = await mailbox.latest("magicLink", { to });
  await page.goto(props.url);

  await expect(page.getByTestId("dashboard-welcome-heading")).toBeVisible();
});
