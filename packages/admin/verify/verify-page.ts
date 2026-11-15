import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Browser, Page } from "@playwright/test";

import type { PageEvent, VerifyReport } from "./report.js";
import type { Seeded, Site } from "./site.js";
import { axeViolations } from "../e2e/support/axe.js";
import { buildReport } from "./report.js";
import { signIn } from "./site.js";

export interface VerifyPageOptions {
  readonly browser: Browser;
  readonly site: Site;
  readonly adminURL: string;
  readonly role: string;
  /** Relative to the admin's base, as `AdminPage.route` spells it. */
  readonly route: string;
  readonly out: string;
  readonly video: boolean;
  /** What `--seed` wrote through the playground's seeder, for the report. */
  readonly seeded?: Seeded;
}

/** What `verifyPage` writes to `out`, beside a `video.webm` when asked for. */
export const VERIFY_FILES = {
  desktopLight: "desktop-light.png",
  desktopDark: "desktop-dark.png",
  phoneLight: "phone-light.png",
  report: "report.json",
  video: "video.webm",
} as const;

const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };

interface View {
  readonly viewport: { readonly width: number; readonly height: number };
  readonly theme: "light" | "dark";
  readonly file: string;
}

const DESKTOP_LIGHT: View = {
  viewport: DESKTOP,
  theme: "light",
  file: VERIFY_FILES.desktopLight,
};
const DESKTOP_DARK: View = {
  viewport: DESKTOP,
  theme: "dark",
  file: VERIFY_FILES.desktopDark,
};
const PHONE_LIGHT: View = {
  viewport: PHONE,
  theme: "light",
  file: VERIFY_FILES.phoneLight,
};
const SKELETON = "[data-slot='skeleton']";

function recordEvents(page: Page): readonly PageEvent[] {
  const events: PageEvent[] = [];
  page.on("console", (message) => {
    const { url, lineNumber } = message.location();
    events.push({
      kind: "console",
      type: message.type(),
      text: message.text(),
      location: url === "" ? undefined : `${url}:${String(lineNumber)}`,
    });
  });
  page.on("pageerror", (error) => {
    events.push({ kind: "pageerror", message: String(error) });
  });
  page.on("response", (response) => {
    events.push({
      kind: "response",
      method: response.request().method(),
      url: response.url(),
      status: response.status(),
    });
  });
  page.on("requestfailed", (request) => {
    events.push({
      kind: "requestfailed",
      method: request.method(),
      url: request.url(),
      failure: request.failure()?.errorText ?? "",
    });
  });
  return events;
}

/** The content in frame has loaded: no request in flight, no skeleton left. */
async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(
    (selector) => document.querySelector(selector) === null,
    SKELETON,
  );
  await page.evaluate(() => document.fonts.ready);
}

/**
 * A fresh load per view: the admin follows the OS theme until a person picks
 * one, and flipping it on a loaded page captures the colours mid-transition.
 */
async function open(page: Page, path: string, view: View): Promise<void> {
  await page.setViewportSize(view.viewport);
  await page.emulateMedia({ colorScheme: view.theme });
  await page.goto(path);
  await settle(page);
  await page.locator(`html.${view.theme}`).waitFor({ state: "attached" });
}

async function capture(page: Page, path: string): Promise<void> {
  await page.screenshot({
    path,
    fullPage: true,
    animations: "disabled",
    caret: "hide",
  });
}

/**
 * Signs in a new user of `role` and writes `VERIFY_FILES` to `out`. The report
 * covers every load; axe scans only the desktop light one.
 */
export async function verifyPage(
  options: VerifyPageOptions,
): Promise<VerifyReport> {
  const { browser, out } = options;
  await mkdir(out, { recursive: true });
  // axe records too, from a blank page of its own, so only ours is kept.
  const videoDir = options.video
    ? await mkdtemp(join(tmpdir(), "verify-admin-video-"))
    : undefined;
  const context = await browser.newContext({
    baseURL: options.adminURL,
    storageState: await signIn(options.site, options.role),
    recordVideo:
      videoDir === undefined ? undefined : { dir: videoDir, size: DESKTOP },
  });
  const page = await context.newPage();
  const events = recordEvents(page);

  const path = options.route.replace(/^\//, "");
  await open(page, path, DESKTOP_LIGHT);
  const finalUrl = page.url();
  const violations = await axeViolations(page);
  await capture(page, join(out, DESKTOP_LIGHT.file));
  for (const view of [DESKTOP_DARK, PHONE_LIGHT]) {
    await open(page, path, view);
    await capture(page, join(out, view.file));
  }

  await context.close();
  if (videoDir !== undefined) {
    await page.video()?.saveAs(join(out, VERIFY_FILES.video));
    await rm(videoDir, { recursive: true, force: true });
  }

  const report = buildReport({
    route: options.route,
    finalUrl,
    events,
    axeViolations: violations,
  });
  await writeFile(
    join(out, VERIFY_FILES.report),
    `${JSON.stringify(
      {
        site: options.site.name,
        role: options.role,
        route: options.route,
        seeded: options.seeded,
        ...report,
      },
      null,
      2,
    )}\n`,
  );
  return report;
}
