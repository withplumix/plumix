import { expect, test } from "@plumix/core/test/playwright";

// The playground's `email-code` method declares this mail through `plumix`,
// which core's typecheck cannot read, so the e2e names its props here.
declare module "../src/mail/contract/registry.js" {
  interface MailRegistry {
    emailCode: { readonly code: string };
  }
}

// Every test starts signed out; the default storage state is an admin's.
test.use({ storageState: { cookies: [], origins: [] } });

const ALLOWED_DOMAIN = "allowed.test";

test.describe("the email-code method from a theme island", () => {
  test("signs a new reader on an allowed domain in, and lands on /account", async ({
    page,
    mailbox,
  }) => {
    const email = `reader@${ALLOWED_DOMAIN}`;
    await mailbox.clear();
    await page.goto("/sign-in");
    await expect(page.getByTestId("sign-in-form")).toHaveAttribute("data-live");

    await page.getByTestId("sign-in-email").fill(email);
    await page.getByTestId("sign-in-send-code").click();
    await expect(page.getByTestId("sign-in-code")).toBeVisible();
    const { props } = await mailbox.latest("emailCode", { to: email });
    await page.getByTestId("sign-in-code").fill(props.code);
    await page.getByTestId("sign-in-submit").click();

    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByTestId("account-email")).toHaveText(email);
  });

  test("refuses an address outside the allowlist with domain_not_allowed", async ({
    page,
    mailbox,
  }) => {
    const email = "stranger@elsewhere.test";
    await mailbox.clear();
    await page.goto("/sign-in");
    await expect(page.getByTestId("sign-in-form")).toHaveAttribute("data-live");

    await page.getByTestId("sign-in-email").fill(email);
    await page.getByTestId("sign-in-send-code").click();
    const { props } = await mailbox.latest("emailCode", { to: email });
    await page.getByTestId("sign-in-code").fill(props.code);
    await page.getByTestId("sign-in-submit").click();

    await expect(page.getByTestId("sign-in-error")).toHaveAttribute(
      "data-code",
      "domain_not_allowed",
    );
    await page.goto("/account");
    await expect(page.getByTestId("account-signed-out")).toBeVisible();
  });
});

test.describe("the email-code method from a form with no script", () => {
  test.use({ javaScriptEnabled: false });

  test("shows a wrong code's error on loginPath", async ({ page, mailbox }) => {
    const email = `wrong@${ALLOWED_DOMAIN}`;
    await mailbox.clear();
    await page.goto("/sign-in-no-script");
    await page.getByTestId("plain-sign-in-email").fill(email);
    await page.getByTestId("plain-sign-in-send-code").click();
    await expect(page.getByTestId("plain-sign-in-sent")).toBeVisible();

    await page.getByTestId("plain-sign-in-email").fill(email);
    await page.getByTestId("plain-sign-in-code").fill("not-a-code");
    await page.getByTestId("plain-sign-in-submit").click();

    await expect(page.getByTestId("plain-sign-in-error")).toHaveAttribute(
      "data-code",
      "wrong_code",
    );
  });

  test("signs a reader in and lands on /account", async ({ page, mailbox }) => {
    const email = `plain@${ALLOWED_DOMAIN}`;
    await mailbox.clear();
    await page.goto("/sign-in-no-script");
    await page.getByTestId("plain-sign-in-email").fill(email);
    await page.getByTestId("plain-sign-in-send-code").click();
    await expect(page.getByTestId("plain-sign-in-sent")).toBeVisible();
    const { props } = await mailbox.latest("emailCode", { to: email });

    await page.getByTestId("plain-sign-in-email").fill(email);
    await page.getByTestId("plain-sign-in-code").fill(props.code);
    await page.getByTestId("plain-sign-in-submit").click();

    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByTestId("account-email")).toHaveText(email);
  });
});
