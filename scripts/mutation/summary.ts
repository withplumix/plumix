interface Position {
  readonly line: number;
  readonly column: number;
}

/** The parts of Stryker's JSON report (mutation-testing-report-schema) a summary reads. */
export interface MutationReport {
  readonly files: Record<
    string,
    {
      readonly source: string;
      readonly mutants: readonly {
        readonly id: string;
        readonly mutatorName: string;
        readonly replacement: string;
        readonly status: string;
        readonly location: { readonly start: Position; readonly end: Position };
        readonly coveredBy?: readonly string[];
        readonly testsCompleted?: number;
      }[];
    }
  >;
  readonly testFiles?: Record<
    string,
    {
      readonly tests: readonly { readonly id: string; readonly name: string }[];
    }
  >;
}

export interface SurvivingLine {
  readonly at: string;
  readonly code: string;
  readonly status: "Survived" | "NoCoverage";
  readonly mutants: readonly string[];
  readonly ran: readonly string[];
}

export interface Summary {
  readonly lines: readonly SurvivingLine[];
  /** Lines whose covered mutant ran no test: the runner failed, so the verdict says nothing. */
  readonly broken: readonly string[];
}

const RAN_SHOWN = 3;

export function summarize(report: MutationReport): Summary {
  const testNames = new Map<string, string>();
  for (const { tests } of Object.values(report.testFiles ?? {})) {
    for (const test of tests) testNames.set(test.id, test.name);
  }
  const broken: string[] = [];
  const lines = new Map<
    string,
    {
      at: string;
      code: string;
      status: SurvivingLine["status"];
      mutants: string[];
      ran: string[];
    }
  >();
  for (const [file, { source, mutants }] of Object.entries(report.files)) {
    const rows = source.split("\n");
    for (const m of mutants) {
      if (m.status !== "Survived" && m.status !== "NoCoverage") continue;
      const { start, end } = m.location;
      const row = rows[start.line - 1] ?? "";
      const original =
        start.line === end.line
          ? row.slice(start.column - 1, end.column - 1)
          : row.slice(start.column - 1);
      const at = `${file}:${start.line}`;
      if (m.status === "Survived" && m.testsCompleted === 0) {
        if (!broken.includes(at)) broken.push(at);
        continue;
      }
      const line = lines.get(at) ?? {
        at,
        code: row.trim(),
        status: m.status,
        mutants: [],
        ran: [],
      };
      line.mutants.push(`${original} → ${m.replacement}`);
      if (m.status === "Survived") line.status = "Survived";
      for (const id of m.coveredBy ?? []) {
        const name = testNames.get(id) ?? id;
        if (line.ran.length < RAN_SHOWN && !line.ran.includes(name))
          line.ran.push(name);
      }
      lines.set(at, line);
    }
  }
  return { lines: [...lines.values()], broken };
}
