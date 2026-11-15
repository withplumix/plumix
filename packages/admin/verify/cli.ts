// `pnpm verify:admin`: open an admin page on a playground as a role, and write
// its screenshots and a report. `--list` prints the pages a playground serves.
import { existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { chromium } from "@playwright/test";

import { roleEntries } from "@plumix/core/manifest";

import type { AdminPage } from "./page-list.js";
import type { VerifyReport } from "./report.js";
import type { Site } from "./site.js";
import type { Steps } from "./steps.js";
import { adminPageList, pageId } from "./page-list.js";
import { hasProblems } from "./report.js";
import { redirectOf } from "./route.js";
import {
  findSite,
  playgroundSites,
  REPO_ROOT,
  runSeeder,
  seedSite,
  siteRegistry,
  startSite,
} from "./site.js";
import { VERIFY_FILES, verifyPage } from "./verify-page.js";

const USAGE = `Usage:
  pnpm verify:admin --site <playground> --as <role> --open <route|page-id> [--seed <n>] [--steps <file>] [--video] [--out <dir>]
  pnpm verify:admin --list [--site <playground>]`;

const EXIT_PROBLEMS = 1;
const EXIT_USAGE = 2;

class UsageError extends Error {}

/** `parseArgs` rejects an unknown flag or a missing value with these codes. */
function isParseArgsError(error: unknown): error is Error {
  return (
    error instanceof Error &&
    "code" in error &&
    String(error.code).startsWith("ERR_PARSE_ARGS_")
  );
}

/** pnpm runs the script from the package; a relative `--out` means the caller's directory. */
// eslint-disable-next-line turbo/no-undeclared-env-vars -- pnpm sets it for this script, which no turbo task runs
const CALLER_DIR = process.env.INIT_CWD ?? process.cwd();

function parseCount(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1) {
    throw new UsageError(
      `--seed takes a whole number of rows, got "${value}".`,
    );
  }
  return count;
}

/** Loaded before the site boots, so a missing or broken file fails at once. */
async function loadSteps(file: string): Promise<Steps> {
  const path = resolve(CALLER_DIR, file);
  if (!existsSync(path)) {
    throw new UsageError(`--steps names no file: ${path}.`);
  }
  const { default: steps } = (await import(pathToFileURL(path).href)) as {
    readonly default: Steps;
  };
  return steps;
}

function siteNamed(name: string): Site {
  const site = findSite(name);
  if (site === undefined) {
    const names = playgroundSites().map((candidate) => candidate.name);
    throw new UsageError(
      `No playground named "${name}". Pass one of: ${names.join(", ")}.`,
    );
  }
  return site;
}

function required(value: string | undefined, flag: string): string {
  if (value === undefined) throw new UsageError(`${flag} is required.`);
  return value;
}

function resolvePage(pages: readonly AdminPage[], open: string): AdminPage {
  if (open.startsWith("/")) {
    return (
      pages.find((page) => page.route === open) ?? {
        id: pageId(open),
        route: open,
        roles: [],
      }
    );
  }
  const page = pages.find((candidate) => candidate.id === open);
  if (page === undefined) {
    throw new UsageError(
      `No page "${open}". Pass a route starting with "/", or one of: ${pages.map((p) => p.id).join(", ")}.`,
    );
  }
  return page;
}

function formatTable(rows: readonly (readonly string[])[]): string {
  const widths = rows[0]?.map((_, column) =>
    Math.max(...rows.map((row) => row[column]?.length ?? 0)),
  );
  return rows
    .map((row) =>
      row
        .map((cell, column) => cell.padEnd(widths?.[column] ?? 0))
        .join("  ")
        .trimEnd(),
    )
    .join("\n");
}

async function listPages(sites: readonly Site[]): Promise<void> {
  for (const site of sites) {
    const pages = adminPageList(await siteRegistry(site));
    const rows = [
      ["ID", "ROUTE", "CAPABILITY", "ROLES"],
      ...pages.map((page) => [
        page.id,
        page.route,
        page.capability ?? "-",
        page.roles.join(", "),
      ]),
    ];
    console.log(`${site.name} (${relative(REPO_ROOT, site.dir)})`);
    console.log(`${formatTable(rows)}\n`);
  }
}

/** Relative to the caller when `out` sits under their directory. */
function displayPath(path: string): string {
  const fromCaller = relative(CALLER_DIR, path);
  if (fromCaller === "") return ".";
  return fromCaller.startsWith("..") ? path : fromCaller;
}

function summarizeSteps(steps: VerifyReport["steps"]): string[] {
  if (steps === undefined) return [];
  const passed = `${String(steps.passed)} passed`;
  const [failure] = steps.failed;
  if (failure === undefined) return [`steps      ${passed}`];
  return [
    `steps      ${passed}, ${String(steps.failed.length)} failed, at ${failure.screenshot}`,
    ...failure.message.split("\n").map((line) => `  ${line}`.trimEnd()),
  ];
}

function summarize(
  report: VerifyReport,
  expectedRoute: string,
  out: string,
  files: string[],
): string {
  const { redirected } = report;
  const missed = redirectOf(expectedRoute, report.finalUrl) !== undefined;
  return [
    `final URL  ${report.finalUrl}`,
    ...(redirected === undefined
      ? []
      : [`redirected ${redirected.from} → ${redirected.to}`]),
    ...(missed ? [`expected   ${expectedRoute}, not reached`] : []),
    `console    ${String(report.consoleErrors.length)} errors, ${String(report.consoleWarnings.length)} warnings`,
    `requests   ${String(report.failedRequests.length)} failed`,
    `axe        ${String(report.axeViolations.length)} violations`,
    ...summarizeSteps(report.steps),
    `wrote      ${displayPath(out)}/{${files.join(",")}}`,
  ].join("\n");
}

async function verify(values: {
  readonly site?: string;
  readonly as?: string;
  readonly open?: string;
  readonly "expect-route"?: string;
  readonly seed?: string;
  readonly steps?: string;
  readonly video: boolean;
  readonly out?: string;
}): Promise<number> {
  const site = siteNamed(required(values.site, "--site"));
  const role = required(values.as, "--as");
  const open = required(values.open, "--open");
  const seed = parseCount(values.seed);
  const steps =
    values.steps === undefined ? undefined : await loadSteps(values.steps);

  const registry = await siteRegistry(site);
  const roles = roleEntries(registry.roles).map((entry) => entry.name);
  if (!roles.includes(role)) {
    throw new UsageError(
      `No role "${role}" on ${site.name}. Pass one of: ${roles.join(", ")}.`,
    );
  }
  const page = resolvePage(adminPageList(registry), open);
  const out =
    values.out === undefined
      ? join(REPO_ROOT, ".cache/verify-admin", site.name, `${page.id}-${role}`)
      : resolve(CALLER_DIR, values.out);

  console.log(`Opening ${page.route} on ${site.name} as ${role}…`);
  const running = await startSite(site);
  let report: VerifyReport;
  try {
    if (seed !== undefined) await seedSite(site, registry, seed);
    const browser = await chromium.launch();
    try {
      const seeded =
        seed === undefined
          ? undefined
          : await runSeeder(site, browser, running.adminURL, seed);
      report = await verifyPage({
        browser,
        site,
        adminURL: running.adminURL,
        role,
        route: page.route,
        out,
        video: values.video,
        seeded,
        steps,
      });
    } finally {
      await browser.close();
    }
  } finally {
    await running.stop();
  }

  const files = [
    VERIFY_FILES.desktopLight,
    VERIFY_FILES.desktopDark,
    VERIFY_FILES.phoneLight,
    ...(steps === undefined ? [] : [VERIFY_FILES.steps]),
    VERIFY_FILES.report,
    ...(values.video ? [VERIFY_FILES.video] : []),
  ];
  const expectedRoute = values["expect-route"] ?? page.route;
  console.log(summarize(report, expectedRoute, out, files));
  return hasProblems(report, expectedRoute) ? EXIT_PROBLEMS : 0;
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      site: { type: "string" },
      as: { type: "string" },
      open: { type: "string" },
      "expect-route": { type: "string" },
      seed: { type: "string" },
      steps: { type: "string" },
      video: { type: "boolean", default: false },
      out: { type: "string" },
      list: { type: "boolean", default: false },
    },
  });
  if (values.list) {
    await listPages(
      values.site === undefined ? playgroundSites() : [siteNamed(values.site)],
    );
    return 0;
  }
  return verify(values);
}

try {
  process.exitCode = await main();
} catch (error) {
  if (!(error instanceof UsageError || isParseArgsError(error))) throw error;
  console.error(`${error.message}\n\n${USAGE}`);
  process.exitCode = EXIT_USAGE;
}
