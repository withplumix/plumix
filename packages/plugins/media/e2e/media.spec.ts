// Worker-driven plugin e2e (#251 / #250). Runs against the real media
// playground at `../playground` via `plumix dev`, seeded by globalSetup
// with an admin user + storageState carrying the session cookie. No
// RPC mocking — the spec exercises the media plugin end-to-end through
// the actual oRPC + miniflare D1 + miniflare R2 round-trip.
//
// Upload routes through the worker's MEDIA binding (miniflare R2
// emulation) because the playground doesn't configure S3 credentials;
// `media.createUploadUrl` returns a same-origin `/_plumix/media/upload/<id>`
// URL the browser PUTs to. No `**/storage.test/**` mock needed.

import { expect, test } from "@playwright/test";

test.describe.serial("@plumix/plugin-media — worker-driven happy path", () => {
  test("empty state → upload → card visible → delete → empty again", async ({
    page,
  }) => {
    // 1. Empty library renders the dropzone affordance against a fresh
    //    worker.
    await page.goto("pages/media");
    await expect(page.getByTestId("media-library")).toBeVisible();
    await expect(page.getByTestId("media-library-title")).toHaveText(
      "Media Library",
    );
    await expect(page.getByTestId("media-library-dropzone")).toBeVisible();
    await expect(page.getByTestId("media-library-dropzone")).toContainText(
      "library is empty",
    );

    // 2. Upload a minimal valid 1×1 transparent PNG via the Upload
    //    button's hidden file input. The plugin's `confirm` step
    //    validates the uploaded bytes against the declared MIME — the
    //    buffer below is a real PNG signature + IHDR + IDAT + IEND so
    //    confirm doesn't 409. The worker handles createUploadUrl →
    //    worker-routed PUT → confirm in a single round-trip; on
    //    success the list query invalidates and a card appears.
    const PNG_1X1 = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
      0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x62, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
      0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);
    const fileInput = page.locator(
      '[data-testid="media-library-upload"] input[type="file"]',
    );
    // Wait for the confirm round-trip explicitly so the assertion
    // below doesn't race the list query's refetch.
    const confirmed = page.waitForResponse(
      (r) => r.url().endsWith("/media/confirm") && r.status() === 200,
    );
    await fileInput.setInputFiles({
      name: "smoke.png",
      mimeType: "image/png",
      buffer: PNG_1X1,
    });
    await confirmed;

    // After upload + confirm, a single card shows up. The card
    // testid `media-card-<id>` carries server-assigned ids; the
    // `:not(...)` filter excludes the per-card title/delete inner
    // elements that share the testid prefix.
    const cards = page.locator(
      "[data-testid^='media-card-']:not([data-testid$='-title']):not([data-testid$='-delete']):not([data-testid$='-thumb'])",
    );
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText("smoke.png");

    // 3. Delete via the detail drawer: click the card to open the
    //    drawer, click Delete, confirm. The card-level delete button
    //    moved to the drawer when the WP-style card-is-index pattern
    //    landed.
    await cards.first().click();
    await expect(page.getByTestId("media-detail-drawer")).toBeVisible();
    const deleted = page.waitForResponse(
      (r) => r.url().endsWith("/media/delete") && r.status() === 200,
    );
    await page.getByTestId("media-detail-delete").click();
    await page.getByTestId("confirm-dialog-confirm").click();
    await deleted;

    await expect(cards).toHaveCount(0);
    await expect(page.getByTestId("media-library-dropzone")).toBeVisible();
  });
});
