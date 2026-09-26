import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as sandcastle from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";

import { REPO_ROOT } from "./repo.js";

export const AN_HOUR_IN_SECONDS = 3_600;
export const HALF_AN_HOUR_IN_SECONDS = 1_800;

const FORTY_FIVE_MINUTES_IN_MS = 2_700_000;

const CACHE_MOUNTS = [
  {
    hostPath: join(homedir(), ".sandcastle-caches/pnpm-store"),
    sandboxPath: "/home/agent/.pnpm-store",
  },
  {
    hostPath: join(homedir(), ".sandcastle-caches/turbo"),
    sandboxPath: "/home/agent/.turbo-cache",
  },
  {
    hostPath: join(homedir(), ".sandcastle-caches/playwright"),
    sandboxPath: "/home/agent/.cache/ms-playwright",
  },
];

const TASKS_A_LANE_RUNS_AT_ONCE = 2;
const WORKERS_EACH_OF_THOSE_TASKS_GETS = 2;

export const workersALaneOversubscribes = (lanes: number): number =>
  lanes * TASKS_A_LANE_RUNS_AT_ONCE * WORKERS_EACH_OF_THOSE_TASKS_GETS;

const ENV_THAT_KEEPS_TURBO_FROM_OVERSUBSCRIBING_THE_CORES = {
  TURBO_CACHE_DIR: "/home/agent/.turbo-cache",
  TURBO_CONCURRENCY: String(TASKS_A_LANE_RUNS_AT_ONCE),
  VITEST_MAX_WORKERS: String(WORKERS_EACH_OF_THOSE_TASKS_GETS),
  PLAYWRIGHT_BROWSERS_PATH: "/home/agent/.cache/ms-playwright",
};

const SETUP_STEPS = [
  "pnpm install --frozen-lockfile",
  "pnpm --filter @plumix/admin exec playwright install chromium",
  "pnpm build",
];

const asOneCommandBecauseHooksAtTheSameHookPointRunConcurrently = (
  steps: readonly string[],
) => steps.join(" && ");

const plumixContainer = () => {
  for (const { hostPath } of CACHE_MOUNTS)
    mkdirSync(hostPath, { recursive: true });
  return docker({
    mounts: CACHE_MOUNTS,
    env: ENV_THAT_KEEPS_TURBO_FROM_OVERSUBSCRIBING_THE_CORES,
  });
};

const setupHooks = {
  sandbox: {
    onSandboxReady: [
      {
        command:
          asOneCommandBecauseHooksAtTheSameHookPointRunConcurrently(
            SETUP_STEPS,
          ),
        timeoutMs: FORTY_FIVE_MINUTES_IN_MS,
      },
    ],
  },
};

export const createPlumixSandbox = (
  branch: string,
): Promise<sandcastle.Sandbox> =>
  sandcastle.createSandbox({
    cwd: REPO_ROOT,
    branch,
    sandbox: plumixContainer(),
    hooks: setupHooks,
  });

export const createReadOnlySandbox = (
  branch: string,
): Promise<sandcastle.Sandbox> =>
  sandcastle.createSandbox({
    cwd: REPO_ROOT,
    branch,
    sandbox: plumixContainer(),
  });

export const plumixRunOptions = {
  cwd: REPO_ROOT,
  sandbox: plumixContainer(),
  hooks: setupHooks,
};
