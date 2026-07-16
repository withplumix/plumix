import { DEFAULT_RUNTIME } from "./scaffold.js";

// A field the interactive wizard would prompt for when not flagged. Kept
// local until the wizard slice imports it.
type PromptKey = "targetDir" | "runtime" | "plugins";

export interface Reconciliation {
  readonly targetDir: string | undefined;
  readonly runtimeId: string;
  readonly pluginIds: readonly string[];
  readonly yes: boolean;
  /** Fields not supplied by flags — empty under `--yes`. */
  readonly prompts: readonly PromptKey[];
}

interface ParsedArgs {
  readonly target: string | undefined;
  readonly runtime: string | undefined;
  readonly plugins: readonly string[] | undefined;
  readonly yes: boolean;
}

/**
 * Turn raw argv into a resolved selection plus the plan of fields a wizard
 * would still prompt for. `--yes` accepts every default and empties the
 * plan; without it, each un-flagged field is reported so the caller (the
 * interactive wizard, in a later slice) can ask. Id validation is the
 * scaffolder's job — this stays a pure argv → intent mapping.
 */
export function reconcile(argv: readonly string[]): Reconciliation {
  const parsed = parseArgs(argv);
  const missing: PromptKey[] = [];
  if (parsed.target === undefined) missing.push("targetDir");
  if (parsed.runtime === undefined) missing.push("runtime");
  if (parsed.plugins === undefined) missing.push("plugins");

  return {
    targetDir: parsed.target,
    runtimeId: parsed.runtime ?? DEFAULT_RUNTIME,
    pluginIds: parsed.plugins ?? [],
    yes: parsed.yes,
    prompts: parsed.yes ? [] : missing,
  };
}

function splitCsv(csv: string): string[] {
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// A flag not passed stays `undefined` (distinct from an explicit empty
// value), so `reconcile` can tell "defaulted" from "the user said none".
function parseArgs(argv: readonly string[]): ParsedArgs {
  let runtime: string | undefined;
  let plugins: string[] | undefined;
  let yes = false;
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (arg === "--runtime") {
      runtime = argv[i + 1] ?? "";
      i++;
    } else if (arg.startsWith("--runtime=")) {
      runtime = arg.slice("--runtime=".length);
    } else if (arg === "--plugins" || arg === "-p") {
      plugins = splitCsv(argv[i + 1] ?? "");
      i++;
    } else if (arg.startsWith("--plugins=")) {
      plugins = splitCsv(arg.slice("--plugins=".length));
    } else if (arg === "--yes" || arg === "-y") {
      yes = true;
    } else if (!arg.startsWith("-")) {
      positional.push(arg);
    }
  }

  return { target: positional[0], runtime, plugins, yes };
}
