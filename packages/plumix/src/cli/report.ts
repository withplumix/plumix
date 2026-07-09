import { styleText } from "node:util";

import { isCliError } from "@plumix/core";

const useColor = shouldUseColor();

function shouldUseColor(): boolean {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  return Boolean(process.stderr.isTTY);
}

function paint(style: Parameters<typeof styleText>[0], text: string): string {
  return useColor ? styleText(style, text) : text;
}

// A compact brand badge (Astro-style) shown ahead of a dev/build session: the
// `plumix` label plus the caller's dynamically-resolved version. On stderr like
// the rest of `report`, colour-gated through `paint`. The full wordmark is
// reserved for the scaffolder's one-time welcome.
export function badge(version: string): void {
  const label = paint(["bgMagenta", "whiteBright"], " plumix ");
  process.stderr.write(`\n${label} ${paint("dim", `v${version}`)}\n\n`);
}

export const report = {
  error(message: string): void {
    process.stderr.write(`${paint("red", "error")} ${message}\n`);
  },
  hint(message: string): void {
    process.stderr.write(`  ${paint("dim", "→")} ${message}\n`);
  },
  success(message: string): void {
    process.stderr.write(`${paint("green", "✓")} ${message}\n`);
  },
  info(message: string): void {
    process.stderr.write(`${message}\n`);
  },
  verbose(message: string): void {
    if (!process.env.PLUMIX_VERBOSE) return;
    process.stderr.write(`${paint("dim", message)}\n`);
  },
};

export function exitWithError(error: unknown): never {
  if (isCliError(error)) {
    report.error(`${error.code}: ${error.message}`);
    if (error.hint) report.hint(error.hint);
  } else if (error instanceof Error) {
    report.error(`UNEXPECTED: ${error.name}: ${error.message}`);
    if (error.stack) report.verbose(error.stack);
  } else {
    report.error(`UNEXPECTED: ${String(error)}`);
  }
  process.exit(1);
}
