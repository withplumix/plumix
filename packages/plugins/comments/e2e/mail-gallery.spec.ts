import { expect, test } from "plumix/test/playwright";

/**
 * Absolute, because the rig's `baseURL` is the admin SPA's own root and the
 * gallery is a dev route the worker answers.
 */
const GALLERY = "/_plumix/debug/mail";

function preview(name: string): string {
  return `plumix-mail-preview-${name}`;
}

test.describe("the dev mail gallery", () => {
  test("previews core's and the plugin's mails, with the site's override", async ({
    page,
  }) => {
    await page.goto(GALLERY);

    await expect(page.getByTestId(preview("magicLink"))).toBeVisible();
    await expect(page.getByTestId(preview("emailChange"))).toBeVisible();
    await expect(
      page.getByTestId(preview("commentAwaitingModeration")),
    ).toBeVisible();
    // The site's `mail.overrides.magicLink.html` is what the HTML tab shows.
    await expect(
      page
        .getByTestId(preview("magicLink"))
        .frameLocator('[data-testid="plumix-mail-html"]')
        .locator("body"),
    ).toContainText("Comments playground");
  });

  test("switching the locale renders the subject in that language", async ({
    page,
  }) => {
    await page.goto(GALLERY);
    const subject = page
      .getByTestId(preview("magicLink"))
      .getByTestId("plumix-mail-subject");
    await expect(subject).toHaveText(/^Sign in to /);

    await page.getByTestId("plumix-mail-locale-de").click();

    await expect(subject).toHaveText(/^Bei .+ anmelden$/);
  });

  test("the text tab shows the plain-text body", async ({ page }) => {
    await page.goto(GALLERY);
    const mail = page.getByTestId(preview("magicLink"));

    await mail.getByTestId("plumix-mail-tab-text").click();

    await expect(mail.getByTestId("plumix-mail-text")).toContainText(
      "Sign in to",
    );
    await expect(mail.getByTestId("plumix-mail-html")).toBeHidden();
  });
});
