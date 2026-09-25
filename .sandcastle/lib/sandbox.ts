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

const WORKERS_ONE_CONTAINER_CAN_AFFORD = 2;

export const workersEachLaneCanAfford = (lanes: number): number =>
  Math.max(1, Math.floor(WORKERS_ONE_CONTAINER_CAN_AFFORD / Math.max(1, lanes)));

const envThatKeepsEveryLaneInsideTheHostMemoryLimit = (lanes: number) => ({
  TURBO_CACHE_DIR: "/home/agent/.turbo-cache",
  TURBO_CONCURRENCY: String(workersEachLaneCanAfford(lanes)),
  VITEST_MAX_WORKERS: String(workersEachLaneCanAfford(lanes)),
  PLAYWRIGHT_BROWSERS_PATH: "/home/agent/.cache/ms-playwright",
});

const SETUP_STEPS = [
  "pnpm install --frozen-lockfile",
  "pnpm --filter @plumix/admin exec playwright install chromium",
  "pnpm build",
];

const asOneCommandBecauseHooksAtTheSameHookPointRunConcurrently = (
  steps: readonly string[],
) => steps.join(" && ");

const plumixContainer = (lanes: number) => {
  for (const { hostPath } of CACHE_MOUNTS)
    mkdirSync(hostPath, { recursive: true });
  return docker({
    mounts: CACHE_MOUNTS,
    env: envThatKeepsEveryLaneInsideTheHostMemoryLimit(lanes),
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
  lanes: number,
): Promise<sandcastle.Sandbox> =>
  sandcastle.createSandbox({
    cwd: REPO_ROOT,
    branch,
    sandbox: plumixContainer(lanes),
    hooks: setupHooks,
  });

export const createReadOnlySandbox = (
  branch: string,
): Promise<sandcastle.Sandbox> =>
  sandcastle.createSandbox({
    cwd: REPO_ROOT,
    branch,
    sandbox: plumixContainer(1),
  });

export const plumixRunOptions = {
  cwd: REPO_ROOT,
  sandbox: plumixContainer(1),
  hooks: setupHooks,
};
