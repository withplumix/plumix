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

export interface GateResult {
  readonly name: string;
  readonly command: string;
  readonly durationMs: number;
  readonly startedAt: string;
  readonly outcome: "ok" | "fail" | "skipped";
  readonly exitCode?: number;
  readonly skippedBecause?: string;
  readonly output?: string;
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
  "packages/core/src/blocks",
  "packages/core/src/route",
  "apps/",
];

/**
 * Every package builds `src` and ships `locales`; naming what ships is safer
 * than listing the scripts, fixtures and configs beside it that do not.
 */
const WHAT_A_CONSUMER_INSTALLS =
  /^packages\/(?:plugins\/|runtimes\/)?[^/]+\/(?:src\/.+|locales\/.+|package\.json)$/;
const A_TEST_RATHER_THAN_THE_THING_TESTED = /\.(test|spec)\.[cm]?[jt]sx?$/;

const changesSomethingConsumersInstall = (
  changedPaths: readonly string[],
): boolean =>
  changedPaths.some(
    (path) =>
      WHAT_A_CONSUMER_INSTALLS.test(path) &&
      !A_TEST_RATHER_THAN_THE_THING_TESTED.test(path),
  );

const TURBO_GATE_FLAGS = "--filter=...[origin/main] --output-logs=errors-only";

export const GATES: readonly Gate[] = [
  { name: "check-no-major", command: "pnpm check-no-major" },
  {
    name: "commitlint",
    command: "pnpm commitlint --from origin/main --to HEAD --verbose",
  },
  { name: "format", command: "pnpm format" },
  { name: "i18n", command: "pnpm i18n:check" },
  { name: "knip", command: "pnpm knip" },
  {
    name: "test",
    command: `pnpm exec turbo run test:unit test:build --continue --concurrency=2 ${TURBO_GATE_FLAGS}`,
  },
  {
    name: "e2e",
    command: `pnpm exec turbo run test:e2e ${TURBO_GATE_FLAGS}`,
    appliesWhen: touches(RENDER_AND_ADMIN_PATHS),
    requires:
      "pnpm --filter @plumix/admin exec node -e \"require('@playwright/test').chromium.launch().then((b) => b.close())\"",
  },
];

/**
 * None failed in 67 local runs and CI runs them in parallel, so locally they
 * only delayed the PR. A repair still runs the ones CI failed.
 */
export const GATES_LEFT_TO_CI: readonly Gate[] = [
  {
    name: "publint",
    command: `pnpm exec turbo run publint ${TURBO_GATE_FLAGS}`,
  },
  {
    name: "attw",
    command: `pnpm exec turbo run attw ${TURBO_GATE_FLAGS}`,
  },
  {
    name: "lint",
    command: `pnpm exec turbo run lint --continue ${TURBO_GATE_FLAGS} -- --cache --cache-location .cache/.eslintcache`,
  },
  {
    name: "typecheck",
    command: `pnpm exec turbo run typecheck ${TURBO_GATE_FLAGS}`,
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

/**
 * The container's PID 1 is `sleep infinity`, which never reaps a gate's
 * orphans; a zombie still answers `kill -0`. tini as a subreaper reaps them.
 */
export const underAnOrphanReaper = (command: string): string =>
  `tini -s -- sh -c '${command.replace(/'/g, "'\\''")}'`;

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
  Test: "test",
  "Test (build)": "test",
  "Test (e2e)": "e2e",
  Publint: "publint",
  "Are The Types Wrong": "attw",
};

export const gateBehindCheck = (checkName: string): Gate | undefined => {
  const gateName = GATE_BEHIND_EACH_CI_CHECK[checkName];
  return [...GATES, CHANGESET_GATE, ...GATES_LEFT_TO_CI].find(
    ({ name }) => name === gateName,
  );
};

export interface GateRunOutcome {
  readonly results: readonly GateResult[];
  readonly failures: readonly GateFailure[];
}

export interface GateRunOptions {
  readonly stopAtFirstFailure: boolean;
  readonly onResult: (result: GateResult) => void;
  readonly retryAFailureOnce?: boolean;
}

export const runGates = async (
  sandbox: Executor,
  gates: readonly Gate[],
  { stopAtFirstFailure, onResult, retryAFailureOnce }: GateRunOptions,
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

    const runOnce = async (): Promise<GateResult> => {
      const attemptStartedAtMs = Date.now();
      const { exitCode, stdout, stderr } = await sandbox.exec(
        underAnOrphanReaper(gate.command),
      );
      return {
        name: gate.name,
        command: gate.command,
        startedAt: new Date(attemptStartedAtMs).toISOString(),
        durationMs: Date.now() - attemptStartedAtMs,
        outcome: exitCode === 0 ? "ok" : "fail",
        exitCode,
        ...(exitCode !== 0 && {
          output: `${stdout}\n${stderr}`.slice(-8000),
        }),
      };
    };

    let attempt = await runOnce();
    results.push(attempt);
    onResult(attempt);

    if (attempt.outcome === "fail" && retryAFailureOnce) {
      attempt = await runOnce();
      results.push(attempt);
      onResult(attempt);
    }

    const { exitCode, output = "" } = attempt;
    if (exitCode !== 0) {
      failures.push({
        name: gate.name,
        command: gate.command,
        output,
      });
      if (stopAtFirstFailure) return { results, failures };
    }
  }

  return { results, failures };
};
