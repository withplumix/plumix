import type { CommandDefinition } from "@plumix/core";

export interface CommandGroup {
  readonly label: string;
  readonly commands: ReadonlyMap<string, CommandDefinition>;
}

export function formatHelp(groups: readonly CommandGroup[]): string {
  const lines = [
    "plumix — headless CMS for the edge",
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

  return lines.join("\n");
}
