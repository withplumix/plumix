import { mkdirSync } from "node:fs";
import { availableParallelism, homedir } from "node:os";
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
  {
    hostPath: join(homedir(), ".sandcastle-caches/bun"),
    sandboxPath: "/home/agent/.bun",
  },
];

const INSTALL_THE_PINNED_BUN =
  'if [ -f .bun-version ]; then v="$(cat .bun-version)"; ' +
  '[ "$(~/.bun/bin/bun --version 2>/dev/null)" = "$v" ] || ' +
  'curl -fsSL https://bun.sh/install | bash -s "bun-v$v"; ' +
  "mkdir -p ~/.local/bin && ln -sf ~/.bun/bin/bun ~/.local/bin/bun; fi";

export const TASKS_A_LANE_RUNS_AT_ONCE = 2;

export const testWorkersEachTaskGets = (lanes: number, cores: number): number =>
  Math.max(1, Math.floor(cores / (lanes * TASKS_A_LANE_RUNS_AT_ONCE)));

let lanesSharingTheHost = 1;

export const pinLaneCount = (lanes: number): void => {
  lanesSharingTheHost = lanes;
};

const envThatKeepsTurboFromOversubscribingTheCores = () => ({
  TURBO_CACHE_DIR: "/home/agent/.turbo-cache",
  TURBO_CONCURRENCY: String(TASKS_A_LANE_RUNS_AT_ONCE),
  VITEST_MAX_WORKERS: String(
    testWorkersEachTaskGets(lanesSharingTheHost, availableParallelism()),
  ),
  PLAYWRIGHT_BROWSERS_PATH: "/home/agent/.cache/ms-playwright",
});

export const SETUP_STEPS = [
  INSTALL_THE_PINNED_BUN,
  "pnpm install --frozen-lockfile",
  "pnpm --filter @plumix/admin exec playwright install chromium",
  "pnpm build",
];

const asOneCommandBecauseHooksAtTheSameHookPointRunConcurrently = (
  steps: readonly string[],
) => steps.join(" && ");

let pinnedImage: string | undefined;

export const pinSandboxImage = (image: string): void => {
  pinnedImage = image;
};

const plumixContainer = () => {
  for (const { hostPath } of CACHE_MOUNTS)
    mkdirSync(hostPath, { recursive: true });
  return docker({
    mounts: CACHE_MOUNTS,
    env: envThatKeepsTurboFromOversubscribingTheCores(),
    imageName: pinnedImage,
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

let registryOperations: Promise<unknown> = Promise.resolve();

const whileNoOtherLaneTouchesTheWorktreeRegistry = <T>(
  operation: () => Promise<T>,
): Promise<T> => {
  const queued = registryOperations.then(operation, operation);
  registryOperations = queued.catch(() => undefined);
  return queued;
};

export const createPlumixSandbox = (
  branch: string,
): Promise<sandcastle.Sandbox> =>
  whileNoOtherLaneTouchesTheWorktreeRegistry(() =>
    sandcastle.createSandbox({
      cwd: REPO_ROOT,
      branch,
      sandbox: plumixContainer(),
      hooks: setupHooks,
    }),
  );

export const closePlumixSandbox = (
  sandbox: sandcastle.Sandbox,
): Promise<sandcastle.CloseResult> =>
  whileNoOtherLaneTouchesTheWorktreeRegistry(() => sandbox.close());

export const createUnbuiltSandbox = (
  branch: string,
): Promise<sandcastle.Sandbox> =>
  whileNoOtherLaneTouchesTheWorktreeRegistry(() =>
    sandcastle.createSandbox({
      cwd: REPO_ROOT,
      branch,
      sandbox: plumixContainer(),
    }),
  );

export const plumixRunOptions = {
  cwd: REPO_ROOT,
  sandbox: plumixContainer(),
  hooks: setupHooks,
};
