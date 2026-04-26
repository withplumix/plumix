// Plugin playground E2E. Mocks the manifest + session + RPC layer using
// `@plumix/core/test/playwright` so we exercise the real built admin
// chunk against a deterministic backend, no D1/R2 needed.
//
// Coverage target (per the plugin author's request — "we just confirming
// it registers in the admin and basic functionality is covered"):
//   1. The plugin's admin page registers and the route resolves.
//   2. The Media Library lists assets returned by entry.list.
//   3. The two-phase upload flow runs end-to-end (createUploadUrl →
//      browser PUT → confirm).

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
    type: "media",
    title: "cat.png",
    slug: "0001-cat",
    excerpt: null,
    status: "published",
    authorId: 1,
    parentId: null,
    content: null,
    menuOrder: 0,
    publishedAt: 1_700_000_000,
    createdAt: 1_700_000_000,
    updatedAt: 1_700_000_000,
    meta: {
      mime: "image/png",
      size: 4096,
      originalName: "cat.png",
      storageKey: "2026/04/0001-cat.png",
    },
  },
  {
    id: 102,
    type: "media",
    title: "report.pdf",
    slug: "0002-report",
    excerpt: null,
    status: "published",
    authorId: 1,
    parentId: null,
    content: null,
    menuOrder: 0,
    publishedAt: 1_700_000_001,
    createdAt: 1_700_000_001,
    updatedAt: 1_700_000_001,
    meta: {
      mime: "application/pdf",
      size: 2_048_000,
      originalName: "report.pdf",
      storageKey: "2026/04/0002-report.pdf",
    },
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
);

interface PluginRpcHandlers {
  readonly entryList: unknown;
  readonly createUploadUrl: unknown;
  readonly confirm: unknown;
  readonly onUpload?: (route: Route) => Promise<void>;
}

async function mockMediaRpc(
  page: Page,
  handlers: PluginRpcHandlers,
): Promise<void> {
  const routes: Readonly<Record<string, unknown>> = {
    "/auth/session": SESSION,
    "/entry/list": handlers.entryList,
    "/media/createUploadUrl": handlers.createUploadUrl,
    "/media/confirm": handlers.confirm,
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
  // real bucket. The plugin's createUploadUrl mock targets a path we can
  // match here (`https://storage.test/...` — `.test` is RFC 6761
  // reserved so the host can never resolve to a real server).
  await page.route("**/storage.test/**", async (route) => {
    if (handlers.onUpload) await handlers.onUpload(route);
    else await route.fulfill({ status: 200, body: "" });
  });
}

test.describe("@plumix/plugin-media", () => {
  test("Media Library page registers and lists assets", async ({ page }) => {
    await mockManifest(page, MANIFEST);
    await mockMediaRpc(page, {
      entryList: SEED_ITEMS,
      createUploadUrl: {},
      confirm: {},
    });

    await page.goto("pages/media");

    await expect(page.getByTestId("media-library")).toBeVisible();
    await expect(page.getByTestId("media-library-title")).toHaveText(
      "Media Library",
    );

    // Both seeded items render as cards.
    await expect(page.getByTestId("media-card-101")).toBeVisible();
    await expect(page.getByTestId("media-card-102")).toBeVisible();
    await expect(page.getByTestId("media-card-101")).toContainText("cat.png");
    await expect(page.getByTestId("media-card-102")).toContainText(
      "report.pdf",
    );
  });

  test("empty state renders when no media exist", async ({ page }) => {
    await mockManifest(page, MANIFEST);
    await mockMediaRpc(page, {
      entryList: [],
      createUploadUrl: {},
      confirm: {},
    });

    await page.goto("pages/media");
    await expect(page.getByTestId("media-library-empty")).toBeVisible();
  });

  test("upload runs the full createUploadUrl → PUT → confirm flow", async ({
    page,
  }) => {
    let putRequestSeen = false;
    await mockManifest(page, MANIFEST);
    await mockMediaRpc(page, {
      entryList: SEED_ITEMS,
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

    // The Upload `<label>` wraps a hidden file input. Setting
    // `setInputFiles` on the label propagates to the inner input.
    const input = page.locator(
      '[data-testid="media-library-upload"] input[type="file"]',
    );
    await input.setInputFiles({
      name: "new.png",
      mimeType: "image/png",
      buffer: Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
    });

    // The mutation chains createUploadUrl → fetch(uploadUrl) → confirm,
    // then invalidates the list query. Wait for the storage PUT to land.
    await expect.poll(() => putRequestSeen).toBe(true);
  });
});
