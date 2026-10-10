import { createRequire } from "node:module";
import * as clack from "@clack/prompts";

import type { PackageManager } from "./package-manager.js";

export interface CliIO {
  stdout(line: string): void;
  stderr(line: string): void;
}

interface ScaffoldOutcome {
  readonly name: string;
  readonly targetDir: string;
  readonly steps: readonly string[];
  readonly pm: PackageManager;
  readonly installFailed: boolean;
  readonly dbSetupFailed: boolean;
}

/**
 * Pre-flight usage errors stay on {@link CliIO}: they can fire before any
 * session opens.
 */
export interface Reporter {
  /** Open an interactive session (no-op on the plain path). */
  intro(): void;
  /** Announce a successful scaffold and the steps left to reach `dev`. */
  created(outcome: ScaffoldOutcome): void;
  /** Report a cancellation or failure with a human-readable message. */
  cancelled(message: string): void;
}

// The plumix wordmark, shown once as a welcome header on a plain scaffold.
export const BANNER = [
  "        _                 _",
  "  _ __ | |_   _ _ __ ___ (_)_  __",
  " | '_ \\| | | | | '_ ` _ \\| \\ \\/ /",
  " | |_) | | |_| | | | | | | |>  <",
  " | .__/|_|\\__,_|_| |_| |_|_/_/\\_\\",
  " |_|",
].join("\n");

// Resolved from this package's own manifest at runtime — never hardcoded.
function readVersion(): string {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require("../package.json") as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/** Deterministic {@link Reporter} for non-interactive runs (pipes, CI). */
export function plainReporter(io: CliIO): Reporter {
  return {
    intro() {
      // No session banner on the plain path — output starts with `created`.
    },
    created({ name, targetDir, steps, installFailed, dbSetupFailed }) {
      io.stdout(BANNER);
      io.stdout(`v${readVersion()}`);
      io.stdout("");
      io.stdout(`Created ${name} at ${targetDir}.`);
      if (installFailed) io.stdout("Dependency install failed.");
      if (dbSetupFailed) io.stdout("Local database setup failed.");
      io.stdout("");
      io.stdout("Next steps:");
      for (const step of steps) io.stdout(`  ${step}`);
    },
    cancelled(message) {
      io.stderr(message);
    },
  };
}

/** Interactive {@link Reporter}, backed by @clack/prompts. */
export const clackReporter: Reporter = {
  intro() {
    clack.intro("create-plumix-app");
  },
  created({ name, steps, pm, installFailed, dbSetupFailed }) {
    if (installFailed) clack.log.warn(`"${pm} install" failed.`);
    if (dbSetupFailed) clack.log.warn("Local database setup failed.");
    clack.outro(`Created ${name}. Next: ${steps.join(" && ")}`);
  },
  cancelled(message) {
    clack.cancel(message);
  },
};
