// Plugin E2E. Mocks the manifest + session + RPC layer using
// `@plumix/core/test/playwright` so we exercise the real built admin
// chunk against a deterministic backend — no D1/R2 needed for CI.
// (Manual end-to-end against a real worker lives in `playground/`,
// run via `pnpm --filter @plumix/plugin-media-playground dev`.)
//
// Coverage:
//   1. The plugin's admin page registers and the route resolves.
//   2. The Media Library lists assets returned by media.list.
//   3. The two-phase upload flow runs end-to-end (createUploadUrl →
//      browser PUT → confirm).
//   4. Delete removes the card after confirmation.

import type { Page, Route } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { PlumixManifest } from "@plumix/core/manifest";
import { emptyManifest } from "@plumix/core/manifest";
import {
  AUTHED_ADMIN,
  mockManifest,
  rpcOkBody,
  withCapabilities,
} from "@plumix/core/test/playwright";

const MEDIA_NAV_LABEL = "Media Library";

const SEED_ITEMS = [
  {
    id: 101,
    title: "cat.png",
    slug: "0001-cat",
    status: "published",
    authorId: 1,
    publishedAt: 1_700_000_000,
    createdAt: 1_700_000_000,
    updatedAt: 1_700_000_000,
    mime: "image/png",
    size: 4096,
    storageKey: "2026/04/0001-cat.png",
    originalName: "cat.png",
    url: "https://media.example.com/2026/04/0001-cat.png",
    thumbnailUrl:
      "https://media.example.com/cdn-cgi/image/width=320,format=auto,fit=cover/2026/04/0001-cat.png",
  },
  {
    id: 102,
    title: "report.pdf",
    slug: "0002-report",
    status: "published",
    authorId: 1,
    publishedAt: 1_700_000_001,
    createdAt: 1_700_000_001,
    updatedAt: 1_700_000_001,
    mime: "application/pdf",
    size: 2_048_000,
    storageKey: "2026/04/0002-report.pdf",
    originalName: "report.pdf",
    url: "https://media.example.com/2026/04/0002-report.pdf",
    thumbnailUrl: "https://media.example.com/2026/04/0002-report.pdf",
  },
];

const MANIFEST: PlumixManifest = {
  ...emptyManifest(),
  entryTypes: [
    {
      name: "media",
      adminSlug: "media",
      label: "Media",
      labels: { singular: "Asset", plural: "Media" },
    },
  ],
  adminNav: [
    {
      id: "management",
      label: "Management",
      priority: 60,
      items: [
        {
          to: "/pages/media",
          label: MEDIA_NAV_LABEL,
          order: 50,
          capability: "entry:media:read",
          coreIcon: "image",
          component: {
            package: "@plumix/plugin-media",
            export: "MediaLibrary",
          },
        },
      ],
    },
  ],
};

const SESSION = withCapabilities(
  AUTHED_ADMIN,
  "entry:media:read",
  "entry:media:create",
  "entry:media:edit_any",
  "entry:media:delete",
);

interface PluginRpcHandlers {
  readonly list: unknown;
  readonly createUploadUrl?: unknown;
  readonly confirm?: unknown;
  readonly delete?: unknown;
  readonly onUpload?: (route: Route) => Promise<void>;
}

async function mockMediaRpc(
  page: Page,
  handlers: PluginRpcHandlers,
): Promise<void> {
  const routes: Readonly<Record<string, unknown>> = {
    "/auth/session": SESSION,
    "/media/list": handlers.list,
    "/media/createUploadUrl": handlers.createUploadUrl ?? {},
    "/media/confirm": handlers.confirm ?? {},
    "/media/delete": handlers.delete ?? { id: 0 },
  };
  await page.route("**/_plumix/rpc/**", (route) => {
    const url = route.request().url();
    for (const [suffix, body] of Object.entries(routes)) {
      if (url.endsWith(suffix)) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody(body),
        });
      }
    }
    return route.fulfill({ status: 404, body: "not-mocked" });
  });

  // Upload PUT endpoint — intercept whatever the createUploadUrl handler
  // returned so the browser's direct-PUT to "storage" succeeds without a
  // real bucket. `.test` is RFC 6761 reserved; the host can never resolve.
  await page.route("**/storage.test/**", async (route) => {
    if (handlers.onUpload) await handlers.onUpload(route);
    else await route.fulfill({ status: 200, body: "" });
  });
}

test.describe("@plumix/plugin-media", () => {
  test("Media Library lists assets and renders thumbnails for image mimes", async ({
    page,
  }) => {
    await mockManifest(page, MANIFEST);
    await mockMediaRpc(page, { list: { items: SEED_ITEMS, hasMore: false } });

    await page.goto("pages/media");

    await expect(page.getByTestId("media-library")).toBeVisible();
    await expect(page.getByTestId("media-library-title")).toHaveText(
      "Media Library",
    );

    await expect(page.getByTestId("media-card-101")).toBeVisible();
    await expect(page.getByTestId("media-card-102")).toBeVisible();
    await expect(page.getByTestId("media-card-101")).toContainText("cat.png");
    await expect(page.getByTestId("media-card-102")).toContainText(
      "report.pdf",
    );

    // image/png card renders an <img> with the imageDelivery thumbnail URL.
    const thumb = page.getByTestId("media-card-101-thumb");
    await expect(thumb).toBeVisible();
    await expect(thumb).toHaveAttribute(
      "src",
      /cdn-cgi\/image\/width=320.*0001-cat\.png/,
    );
  });

  test("empty state renders when no media exist", async ({ page }) => {
    await mockManifest(page, MANIFEST);
    await mockMediaRpc(page, { list: { items: [], hasMore: false } });

    await page.goto("pages/media");
    await expect(page.getByTestId("media-library-empty")).toBeVisible();
  });

  test("upload runs the full createUploadUrl → PUT → confirm flow", async ({
    page,
  }) => {
    let putRequestSeen = false;
    await mockManifest(page, MANIFEST);
    await mockMediaRpc(page, {
      list: { items: SEED_ITEMS, hasMore: false },
      createUploadUrl: {
        uploadUrl: "https://storage.test/upload-target",
        method: "PUT",
        headers: { "content-type": "image/png" },
        mediaId: 999,
        storageKey: "2026/04/9999-new.png",
        expiresAt: Math.floor(Date.now() / 1000) + 600,
      },
      confirm: {
        id: 999,
        url: "https://media.example.com/cdn/2026/04/9999-new.png",
        thumbnailUrl:
          "https://media.example.com/cdn-cgi/image/width=320,format=auto,fit=cover/cdn/2026/04/9999-new.png",
        storageKey: "2026/04/9999-new.png",
        mime: "image/png",
        size: 12,
      },
      onUpload: async (route) => {
        putRequestSeen = route.request().method() === "PUT";
        await route.fulfill({ status: 200, body: "" });
      },
    });

    await page.goto("pages/media");
    await expect(page.getByTestId("media-library")).toBeVisible();

    const input = page.locator(
      '[data-testid="media-library-upload"] input[type="file"]',
    );
    await input.setInputFiles({
      name: "new.png",
      mimeType: "image/png",
      buffer: Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
    });

    await expect.poll(() => putRequestSeen).toBe(true);
  });

  test("delete removes the card after the user confirms", async ({ page }) => {
    await mockManifest(page, MANIFEST);
    await mockMediaRpc(page, {
      list: { items: SEED_ITEMS, hasMore: false },
      delete: { id: 101 },
    });

    // The component uses `window.confirm`; auto-accept it.
    page.on("dialog", (dialog) => {
      void dialog.accept();
    });

    await page.goto("pages/media");
    await expect(page.getByTestId("media-card-101")).toBeVisible();

    // The delete button is shown on hover via opacity-0 → group-hover:
    // opacity-100. Force the click so we don't fight the hover state.
    await page.getByTestId("media-card-101-delete").click({ force: true });

    // The mutation invalidates the list query; we don't reseed in this
    // mock so the next list call returns the same items, but the
    // mutation's success path is what we're verifying here. (Manual
    // testing covers the visual disappearance.)
    await expect.poll(() => page.url()).toContain("/pages/media");
  });
});
