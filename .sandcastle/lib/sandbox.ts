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

const ENV_THAT_KEEPS_VITEST_INSIDE_THE_CONTAINER_MEMORY_LIMIT = {
  TURBO_CACHE_DIR: "/home/agent/.turbo-cache",
  TURBO_CONCURRENCY: "2",
  VITEST_MAX_WORKERS: "2",
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
    env: ENV_THAT_KEEPS_VITEST_INSIDE_THE_CONTAINER_MEMORY_LIMIT,
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

export const plumixRunOptions = {
  cwd: REPO_ROOT,
  sandbox: plumixContainer(),
  hooks: setupHooks,
};
