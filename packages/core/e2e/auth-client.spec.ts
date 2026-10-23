import { expect, test } from "@plumix/core/test/playwright";

// Every test starts signed out; the default storage state is an admin's.
test.use({ storageState: { cookies: [], origins: [] } });

const FIXTURE_EMAIL = "fixture@example.test";

// On a cold `plumix dev`, the session RPC right after the server's first
// sign-in fails in miniflare ("fetch failed"), with or without `authClient`.
// Sign in here until the RPC answers.
test.beforeAll(async ({ playwright, baseURL, browser }) => {
  const request = await playwright.request.newContext({ baseURL });
  const headers = { "x-plumix-request": "1" };
  await request.post("/_plumix/auth/fixture/sign-in", { headers, data: {} });
  await expect
    .poll(async () => {
      const response = await request
        .post("/_plumix/rpc/auth/session", { headers, data: { json: {} } })
        .catch(() => null);
      return response?.ok() ?? false;
    })
    .toBe(true);
  await request.dispose();
  // Vite replays that failure to the next page to connect, as an overlay.
  const page = await browser.newPage({ baseURL });
  const connected = page.waitForEvent("console", (message) =>
    message.text().includes("[vite] connected"),
  );
  await page.goto("/auth");
  await connected;
  await page.close();
});

test.describe("authClient from a theme island", () => {
  test("lists the plugin's method and signs in through its client half", async ({
    page,
  }) => {
    await page.goto("/auth");
    await expect(page.getByTestId("auth-probe")).toHaveAttribute("data-live");
    await expect(page.getByTestId("auth-session")).toHaveText("signed out");
    await expect(
      page.getByTestId("auth-methods").locator('[data-method="fixture"]'),
    ).toHaveText("Fixture");

    await page.getByTestId("auth-fixture").click();

    await expect(page.getByTestId("auth-session")).toHaveText(FIXTURE_EMAIL);
    await expect(page.getByTestId("auth-failure")).toHaveText("");
  });

  test("useSession turns signed-in after signIn.passkey resolves, with no reload", async ({
    page,
    passkey,
  }) => {
    await page.goto("/auth");
    await expect(page.getByTestId("auth-probe")).toHaveAttribute("data-live");
    // A passkey for the fixture account, added while signed in, then signed
    // out of.
    await page.getByTestId("auth-fixture").click();
    await expect(page.getByTestId("auth-session")).toHaveText(FIXTURE_EMAIL);
    await page.getByTestId("auth-passkey-register").click();
    await expect.poll(() => passkey.credentials()).toHaveLength(1);
    await page.getByTestId("auth-sign-out").click();
    await expect(page.getByTestId("auth-session")).toHaveText("signed out");
    // A reload would drop it.
    await page.evaluate(() => {
      (window as { sameDocument?: boolean }).sameDocument = true;
    });

    await page.getByTestId("auth-passkey").click();

    await expect(page.getByTestId("auth-session")).toHaveText(FIXTURE_EMAIL);
    expect(
      await page.evaluate(
        () => (window as { sameDocument?: boolean }).sameDocument,
      ),
    ).toBe(true);
  });
});

test.describe("authClient in the admin", () => {
  test("the login screen signs in through the plugin's client half", async ({
    page,
  }) => {
    await page.goto("/_plumix/admin/login");

    await page.getByTestId("login-method-fixture").click();

    await expect(page.getByTestId("dashboard-welcome-heading")).toBeVisible();
  });
});
