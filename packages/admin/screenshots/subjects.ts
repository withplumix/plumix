import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

import type { PlumixManifest } from "@plumix/core/manifest";
import {
  buildManifest,
  createPluginRegistry,
  toRegisteredEntryType,
} from "@plumix/core/manifest";

import {
  AUTHED_ADMIN,
  mockManifest,
  mockRpc,
  withCapabilities,
} from "../e2e/support/rpc-mock.js";

export const THEMES = ["light", "dark"] as const;

export type Theme = (typeof THEMES)[number];

/**
 * Fixed so relative timestamps don't drift and a re-run produces the same
 * image.
 */
export const CAPTURE_INSTANT = new Date("2026-06-15T09:00:00Z");

export interface ScreenshotSubject {
  /** File stem: writes `<name>-light.png` and `<name>-dark.png`. */
  readonly name: string;
  /**
   * The element the capture frames, so a redesign of the chrome around it
   * leaves the image alone.
   */
  readonly testId: string;
  /**
   * Must wait for the content in frame; a capture taken mid-fetch shows a
   * skeleton.
   */
  readonly open: (page: Page) => Promise<void>;
}

/**
 * Projected through `buildManifest` so the sidebar shows the nav core seeds,
 * not a stale hand-written copy.
 */
function docsManifest(): PlumixManifest {
  const registry = createPluginRegistry();
  for (const entryType of [
    toRegisteredEntryType(
      "post",
      { label: "Posts", labels: { singular: "Post", plural: "Posts" } },
      null,
    ),
    toRegisteredEntryType(
      "page",
      {
        label: "Pages",
        labels: { singular: "Page", plural: "Pages" },
        isHierarchical: true,
      },
      null,
    ),
  ]) {
    registry.entryTypes.set(entryType.name, entryType);
  }
  return buildManifest(registry);
}

/**
 * The e2e session fixture is an admin over `post` alone; the site being
 * photographed has two types.
 */
const DOCS_ADMIN = withCapabilities(
  AUTHED_ADMIN,
  "entry:page:create",
  "entry:page:edit_own",
  "entry:page:edit_any",
  "entry:page:publish",
  "entry:page:read",
);

const DOCS_STATS = [
  { type: "post", status: "published", count: 24 },
  { type: "post", status: "draft", count: 3 },
  { type: "page", status: "published", count: 8 },
  { type: "page", status: "draft", count: 1 },
];

function hoursBefore(hours: number): string {
  return new Date(
    CAPTURE_INSTANT.getTime() - hours * 60 * 60 * 1000,
  ).toISOString();
}

const DOCS_RECENT_ACTIVITY = [
  {
    id: 1,
    type: "post",
    title: "Shipping at the edge",
    slug: "shipping-at-the-edge",
    status: "published",
    updatedAt: hoursBefore(3),
  },
  {
    id: 2,
    type: "post",
    title: "Modelling content with fields",
    slug: "modelling-content-with-fields",
    status: "draft",
    updatedAt: hoursBefore(27),
  },
  {
    id: 3,
    type: "page",
    title: "About",
    slug: "about",
    status: "published",
    updatedAt: hoursBefore(52),
  },
];

export const SCREENSHOT_SUBJECTS: readonly ScreenshotSubject[] = [
  {
    name: "admin-dashboard",
    testId: "app-shell",
    async open(page) {
      await mockManifest(page, docsManifest());
      await mockRpc(page, {
        "/auth/session": DOCS_ADMIN,
        "/entry/stats": DOCS_STATS,
        "/entry/recentActivity": DOCS_RECENT_ACTIVITY,
      });
      await page.goto("");
      await expect(
        page.getByTestId("dashboard-tile-post-counts"),
      ).toContainText("24");
    },
  },
];

/**
 * Its own directory: turbo restores cached outputs, and a glob over
 * `src/assets` would overwrite images a person put there by hand.
 */
const DOCS_ASSETS_DIR = new URL(
  "../../../apps/docs/src/assets/screenshots/",
  import.meta.url,
);

export function screenshotPath(name: string, theme: Theme): string {
  // `screenshot({ path })` creates missing parents, so a moved docs app would
  // otherwise pass while writing where nothing reads.
  if (!existsSync(DOCS_ASSETS_DIR)) {
    throw new Error(
      `Screenshots are written to ${fileURLToPath(DOCS_ASSETS_DIR)}, which does not exist. ` +
        `If apps/docs moved, update DOCS_ASSETS_DIR in screenshots/subjects.ts.`,
    );
  }
  return fileURLToPath(new URL(`${name}-${theme}.png`, DOCS_ASSETS_DIR));
}
