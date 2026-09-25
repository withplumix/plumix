import type * as sandcastle from "@ai-hero/sandcastle";

export interface Gate {
  readonly name: string;
  readonly command: string;
  readonly appliesWhen?: (changedPaths: readonly string[]) => boolean;
  readonly requires?: string;
}

export interface GateFailure {
  readonly name: string;
  readonly command: string;
  readonly output: string;
}

interface GateResult {
  readonly name: string;
  readonly command: string;
  readonly durationMs: number;
  readonly startedAt: string;
  readonly outcome: "ok" | "fail" | "skipped";
  readonly exitCode?: number;
  readonly skippedBecause?: string;
}

const touches =
  (prefixes: readonly string[]) => (changedPaths: readonly string[]) =>
    changedPaths.some((path) =>
      prefixes.some((prefix) => path.startsWith(prefix)),
    );

const RENDER_AND_ADMIN_PATHS = [
  "packages/admin",
  "packages/admin-editor",
  "packages/admin-ui",
  "packages/blocks",
  "packages/core/src/route",
  "apps/",
];

const NEVER_REACHES_DIST =
  /(\.(test|spec)\.[cm]?[jt]sx?$)|(\/(test|e2e|__tests__)\/)|(\/vitest\.config\.[cm]?[jt]s$)|(\/tsconfig\.json$)/;

const changesSomethingConsumersInstall = (
  changedPaths: readonly string[],
): boolean =>
  changedPaths.some(
    (path) =>
      path.startsWith("packages/") && !NEVER_REACHES_DIST.test(`/${path}`),
  );

export const GATES: readonly Gate[] = [
  { name: "check-no-major", command: "pnpm check-no-major" },
  { name: "i18n-ratchet", command: "pnpm i18n:ratchet:check" },
  {
    name: "commitlint",
    command: "pnpm commitlint --from origin/main --to HEAD --verbose",
  },
  { name: "format", command: "pnpm format" },
  { name: "i18n", command: "pnpm i18n:check" },
  { name: "knip", command: "pnpm knip" },
  { name: "publint", command: "pnpm publint" },
  { name: "attw", command: "pnpm attw" },
  { name: "lint", command: "pnpm lint" },
  { name: "typecheck", command: "pnpm typecheck" },
  { name: "test", command: "pnpm test" },
  {
    name: "e2e",
    command: "pnpm test:e2e",
    appliesWhen: touches(RENDER_AND_ADMIN_PATHS),
    requires:
      "pnpm --filter @plumix/admin exec node -e \"require('@playwright/test').chromium.launch().then((b) => b.close())\"",
  },
];

export const CHANGESET_GATE: Gate = {
  name: "changeset",
  command:
    'test -n "$(git diff --name-only origin/main...HEAD -- .changeset/ | grep -v README)" ' +
    '|| { echo "A published package changed but no changeset was added. See AGENTS.md > Releases."; exit 1; }',
  appliesWhen: changesSomethingConsumersInstall,
};

export type Executor = Pick<sandcastle.Sandbox, "exec">;

const changedPathsIn = async (
  sandbox: Executor,
): Promise<readonly string[]> => {
  const { stdout } = await sandbox.exec(
    "git diff --name-only origin/main...HEAD",
  );
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
};

const isAvailable = async (
  sandbox: Executor,
  probe: string,
): Promise<boolean> => {
  const { exitCode } = await sandbox.exec(probe);
  return exitCode === 0;
};

const GATE_BEHIND_EACH_CI_CHECK: Readonly<Record<string, string>> = {
  Commitlint: "commitlint",
  Changesets: "changeset",
  Lint: "lint",
  Format: "format",
  Typecheck: "typecheck",
  Knip: "knip",
  i18n: "i18n",
  "i18n ratchet": "i18n-ratchet",
  Test: "test",
  "Test (build)": "test",
  "Test (e2e)": "e2e",
  Publint: "publint",
  "Are The Types Wrong": "attw",
};

export const gateBehindCheck = (checkName: string): Gate | undefined => {
  const gateName = GATE_BEHIND_EACH_CI_CHECK[checkName];
  return [...GATES, CHANGESET_GATE].find(({ name }) => name === gateName);
};

export const reproduceFailingChecks = async (
  sandbox: Executor,
  checkNames: readonly string[],
): Promise<string> => {
  const reproduced = await Promise.all(
    checkNames.map(async (checkName) => {
      const gate = gateBehindCheck(checkName);
      if (!gate) {
        return `- CI check \`${checkName}\` failed. The harness has no local gate for it, so there is no output to show. Read the workflow in \`.github/workflows/\` to see what it runs.`;
      }
      if (gate.requires && !(await isAvailable(sandbox, gate.requires))) {
        return `- CI check \`${checkName}\` failed. Locally \`${gate.command}\` cannot run, because \`${gate.requires}\` is unavailable in this sandbox, so there is no output to show.`;
      }
      const { stdout, stderr } = await sandbox.exec(gate.command);
      return `- CI check \`${checkName}\` failed. Locally, \`${gate.command}\` says:\n\n\`\`\`\n${`${stdout}\n${stderr}`.trim().slice(-4000)}\n\`\`\``;
    }),
  );
  return reproduced.join("\n\n");
};

export interface GateRunOutcome {
  readonly results: readonly GateResult[];
  readonly failures: readonly GateFailure[];
}

export interface GateRunOptions {
  readonly stopAtFirstFailure: boolean;
  readonly onResult: (result: GateResult) => void;
}

export const runGates = async (
  sandbox: Executor,
  gates: readonly Gate[],
  { stopAtFirstFailure, onResult }: GateRunOptions,
): Promise<GateRunOutcome> => {
  const changedPaths = await changedPathsIn(sandbox);
  const results: GateResult[] = [];
  const failures: GateFailure[] = [];

  for (const gate of gates) {
    const startedAtMs = Date.now();
    const startedAt = new Date(startedAtMs).toISOString();
    const elapsed = () => Date.now() - startedAtMs;

    if (gate.appliesWhen && !gate.appliesWhen(changedPaths)) {
      const skipped: GateResult = {
        name: gate.name,
        command: gate.command,
        startedAt,
        durationMs: elapsed(),
        outcome: "skipped",
        skippedBecause: "no changed path matches this gate",
      };
      results.push(skipped);
      onResult(skipped);
      continue;
    }

    if (gate.requires && !(await isAvailable(sandbox, gate.requires))) {
      const skipped: GateResult = {
        name: gate.name,
        command: gate.command,
        startedAt,
        durationMs: elapsed(),
        outcome: "skipped",
        skippedBecause: `unavailable in the sandbox: ${gate.requires}`,
      };
      results.push(skipped);
      onResult(skipped);
      continue;
    }

    const { exitCode, stdout, stderr } = await sandbox.exec(gate.command);
    const result: GateResult = {
      name: gate.name,
      command: gate.command,
      startedAt,
      durationMs: elapsed(),
      outcome: exitCode === 0 ? "ok" : "fail",
      exitCode,
    };
    results.push(result);
    onResult(result);

    if (exitCode !== 0) {
      failures.push({
        name: gate.name,
        command: gate.command,
        output: `${stdout}\n${stderr}`.slice(-8000),
      });
      if (stopAtFirstFailure) return { results, failures };
    }
  }

  return { results, failures };
};
