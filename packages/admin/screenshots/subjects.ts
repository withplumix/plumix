import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

import type { PlumixManifest } from "@plumix/core/manifest";
import { buildManifest, createPluginRegistry } from "@plumix/core/manifest";

import {
  AUTHED_ADMIN,
  mockManifest,
  mockRpc,
  withCapabilities,
} from "../e2e/support/rpc-mock.js";

export const THEMES = ["light", "dark"] as const;

export type Theme = (typeof THEMES)[number];

/**
 * The instant the admin believes it is while being captured. Relative
 * timestamps ("2 days ago") would otherwise drift with the calendar, and a
 * re-run with no UI change has to produce the same image.
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
   * Stages the admin and navigates to what is being shown, then waits for the
   * content that has to be in frame. The wait is the subject's job: a capture
   * taken while the data is still in flight is a screenshot of a skeleton.
   */
  readonly open: (page: Page) => Promise<void>;
}

// Projected through `buildManifest` rather than declared, because the sidebar
// renders `manifest.adminNav` — which core seeds with its own groups and items.
// A hand-written nav would be a second copy of that list, and the image would
// go on showing the old one after core changed it.
function docsManifest(): PlumixManifest {
  const registry = createPluginRegistry();
  for (const entryType of [
    {
      name: "post",
      registeredBy: null,
      label: "Posts",
      labels: { singular: "Post", plural: "Posts" },
    },
    {
      name: "page",
      registeredBy: null,
      label: "Pages",
      labels: { singular: "Page", plural: "Pages" },
      isHierarchical: true,
    },
  ]) {
    registry.entryTypes.set(entryType.name, entryType);
  }
  return buildManifest(registry);
}

// The e2e session fixture is an admin over `post` alone; the site being
// photographed has two types.
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

// A directory of their own, not `src/assets` at large: turbo caches this task
// by its outputs, and a glob over the shared assets directory would claim — and
// on a cache hit restore over — images a person put there by hand.
const DOCS_ASSETS_DIR = new URL(
  "../../../apps/docs/src/assets/screenshots/",
  import.meta.url,
);

export function screenshotPath(name: string, theme: Theme): string {
  // `screenshot({ path })` creates missing parents, so a docs app that moved
  // would leave the command passing while writing into a directory nothing
  // reads — surfacing later as a missing image in another package's build.
  if (!existsSync(DOCS_ASSETS_DIR)) {
    throw new Error(
      `Screenshots are written to ${fileURLToPath(DOCS_ASSETS_DIR)}, which does not exist. ` +
        `If apps/docs moved, update DOCS_ASSETS_DIR in screenshots/subjects.ts.`,
    );
  }
  return fileURLToPath(new URL(`${name}-${theme}.png`, DOCS_ASSETS_DIR));
}
