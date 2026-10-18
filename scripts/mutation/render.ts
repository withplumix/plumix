import type { SurvivingLine } from "./summary.ts";

export interface PackageLines {
  readonly package: string;
  readonly lines: readonly SurvivingLine[];
}

const plural = (n: number, word: string): string =>
  `${String(n)} ${word}${n === 1 ? "" : "s"}`;

/** The summary an agent reads: one entry per line, grouped by package. */
export function render(packages: readonly PackageLines[]): string {
  const total = packages.reduce((sum, p) => sum + p.lines.length, 0);
  if (total === 0) {
    return `No surviving mutants in the changed lines of ${plural(packages.length, "package")}.\n`;
  }
  const out = [
    `# ${plural(total, "surviving line")} in ${plural(packages.filter((p) => p.lines.length > 0).length, "package")}`,
    "",
    "Read each as a question about the behaviour on that line: CODING_STANDARDS.md#mutation-testing says how to answer it.",
    "",
  ];
  for (const { package: name, lines } of packages) {
    if (lines.length === 0) continue;
    out.push(`## ${name}`, "");
    for (const line of lines) {
      const lead = line.status === "Survived" ? "Survived" : "No test runs";
      out.push(`- ${lead} \`${line.at}\` \`${line.code}\``);
      for (const m of line.mutants)
        out.push(`  - \`${m.replace(/\s+/g, " ")}\``);
      if (line.ran.length > 0) out.push(`  - ran: ${line.ran.join("; ")}`);
    }
    out.push("");
  }
  return out.join("\n");
}
