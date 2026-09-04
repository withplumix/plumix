import type { BrowserContext, Page } from "@playwright/test";

import { CONTENT_LIST_ROWS, PNG_1X1 } from "./site-fixtures.js";
import { expect, test } from "./test.js";

const POST_TITLE = "Hello from the runtime spec";
const POST_SLUG = "hello-from-the-runtime-spec";

/**
 * A passkey the browser holds itself, so the bootstrap ceremony runs
 * end-to-end with no hardware and no prompt. Chromium's virtual
 * authenticator answers `navigator.credentials.create` the way a platform
 * authenticator would; the server sees a real attestation.
 */
async function installVirtualPasskey(
  context: BrowserContext,
  page: Page,
): Promise<void> {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
}

function entryUpdated(page: Page): Promise<unknown> {
  return page.waitForResponse(
    (r) => r.url().endsWith("/entry/update") && r.status() === 200,
  );
}

/**
 * The spec every runtime playground runs: bootstrap the first admin, create
 * and publish an entry, read it on the public page, upload a media item,
 * sign out. Imported by each runtime's playground suite rather than copied,
 * so two runtimes are proven by the same assertions.
 *
 * Expects a playground with the blog and media plugins, a theme whose
 * single-entry template renders the title under `data-testid="post-title"`,
 * and `seedAdminSession: false` — the first step is the bootstrap itself.
 * One test rather than a serial describe: the session lives in the page's
 * context, and a retry restarts from the pre-bootstrap database anyway.
 */
export function runtimeSpec(): void {
  test("bootstrap → publish an entry → read it → upload media → sign out", async ({
    page,
    context,
  }) => {
    await test.step("bootstrap the first admin with a passkey", async () => {
      await installVirtualPasskey(context, page);
      // The admin root sends a fresh site to the bootstrap form.
      await page.goto("./");
      await expect(page.getByTestId("bootstrap-heading")).toBeVisible();
      await page
        .getByTestId("bootstrap-email-input")
        .fill("admin@example.test");
      await page.getByTestId("bootstrap-name-input").fill("First Admin");
      await page.getByTestId("bootstrap-submit").click();
      await expect(page.getByTestId("dashboard-welcome-heading")).toBeVisible();
    });

    await test.step("create and publish an entry", async () => {
      await page.goto("entries/posts");
      const navigated = page.waitForURL(/\/entries\/posts\/\d+\/edit/);
      await page.getByTestId("content-list-new-button").click();
      await navigated;

      await page.getByTestId("plumix-tab-page").click();
      await expect(page.getByTestId("plumix-editor-title-input")).toBeVisible();
      const titleSaved = entryUpdated(page);
      await page.getByTestId("plumix-editor-title-input").fill(POST_TITLE);
      await titleSaved;
      const slugSaved = entryUpdated(page);
      await page.getByTestId("entry-slug-input").fill(POST_SLUG);
      await slugSaved;

      const published = entryUpdated(page);
      await page.getByTestId("plumix-editor-publish-button").click();
      await published;
      // A published entry with nothing pending leaves the button disabled —
      // the editor's receipt.
      await expect(
        page.getByTestId("plumix-editor-publish-button"),
      ).toBeDisabled();

      await page.goto("entries/posts?status=published");
      await expect(
        page.locator(CONTENT_LIST_ROWS).filter({ hasText: POST_TITLE }).first(),
      ).toBeVisible();
    });

    await test.step("read it on the public page", async () => {
      // "/" is the site origin, not the admin base path.
      await page.goto(`/posts/${POST_SLUG}`);
      await expect(page.getByTestId("post-title")).toHaveText(POST_TITLE);
    });

    await test.step("upload a media item", async () => {
      await page.goto("pages/media");
      await expect(page.getByTestId("media-library")).toBeVisible();
      const confirmed = page.waitForResponse(
        (r) => r.url().endsWith("/media/confirm") && r.status() === 200,
      );
      await page
        .locator('[data-testid="media-library-upload"] input[type="file"]')
        .setInputFiles({
          name: "runtime-spec.png",
          mimeType: "image/png",
          buffer: PNG_1X1,
        });
      await confirmed;
      await expect(
        page.locator(
          "[data-testid='media-library-grid'] > [data-testid^='media-card-']",
        ),
      ).toContainText(["runtime-spec.png"]);
    });

    await test.step("sign out", async () => {
      await page.getByTestId("user-menu-trigger").click();
      await page.getByTestId("user-menu-sign-out").click();
      await expect(page.getByTestId("login-heading")).toBeVisible();
    });
  });
}
