import type { CommandDefinition, RuntimeTargetOptions } from "@plumix/core";

export interface CommandGroup {
  readonly label: string;
  readonly commands: ReadonlyMap<string, CommandDefinition>;
}

export interface TargetOptionGroup {
  readonly label: string;
  readonly options: RuntimeTargetOptions;
}

function targetOptionLines({ label, options }: TargetOptionGroup): string[] {
  const flags = Object.entries(options).map(([name, option]) => [
    option.type === "string" ? `--${name} <value>` : `--${name}`,
    option.description,
  ]);
  if (flags.length === 0) return [];
  const width = Math.max(...flags.map(([flag = ""]) => flag.length));
  return [
    `${label}:`,
    ...flags.map(([flag = "", description = ""]) => {
      return `  ${flag.padEnd(width)}    ${description}`;
    }),
    "",
  ];
}

export function formatHelp(
  groups: readonly CommandGroup[],
  targetOptions?: TargetOptionGroup,
): string {
  const lines = [
    "plumix — a CMS for the edge",
    "",
    "Usage:",
    "  plumix <command> [options]",
    "",
    "Options:",
    "  --config <path>    Path to plumix.config.{ts,js,mjs}",
    "  --cwd <path>       Project root (defaults to $PWD)",
    "  --verbose          Print diagnostic output",
    "  --help, -h         Show this help",
    "  --version, -v      Show version",
    "",
  ];

  for (const group of groups) {
    if (group.commands.size === 0) continue;
    lines.push(`${group.label}:`);
    const width = Math.max(...[...group.commands.keys()].map((k) => k.length));
    for (const [name, def] of group.commands) {
      lines.push(`  ${name.padEnd(width)}   ${def.describe}`);
    }
    lines.push("");
  }
  if (targetOptions) lines.push(...targetOptionLines(targetOptions));

  return lines.join("\n");
}
