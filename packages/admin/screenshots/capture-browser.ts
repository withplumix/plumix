import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname } from "node:path";

import { resolveE2EPort } from "@plumix/core/test/playwright";

/**
 * Carries the pinned browser's ws endpoint from the runner to the playwright
 * config the capture project runs on.
 */
export const CAPTURE_ENDPOINT_ENV = "PLUMIX_SCREENSHOT_WS_ENDPOINT";

// Ten clear of the admin preview block (5180 here, 5181 in admin-editor).
const BROWSER_PORT_BASE = 5190;
// Inside the container nothing else is listening, so this never has to move.
const CONTAINER_PORT = 3000;
const MOUNTED_CORE = "/playwright-core";
// What `run-server` prints once it is actually accepting connections.
const READY_MARKER = "Listening on";
const READY_TIMEOUT_MS = 30_000;

// `playwright-core` is @playwright/test's dependency, not admin's, so it
// resolves from there rather than from this file.
const fromPlaywrightTest = createRequire(
  createRequire(import.meta.url).resolve("@playwright/test"),
);

/**
 * The image the capture renders in, tagged with the `playwright-core` this
 * checkout would connect with — mismatched versions refuse each other, so
 * deriving the tag is what keeps the pair matched, and what makes a Playwright
 * bump re-take the images as the Chromium change it is.
 *
 * Exported for direct testing only.
 */
export function captureBrowserImage(): string {
  const { version } = fromPlaywrightTest("playwright-core/package.json") as {
    version: string;
  };
  return `mcr.microsoft.com/playwright:v${version}-noble`;
}

/** Exported for direct testing only. */
export function captureBrowserPort(): number {
  return resolveE2EPort(BROWSER_PORT_BASE);
}

export interface CaptureBrowserRunOptions {
  readonly image: string;
  readonly hostPort: number;
  /** The client's own `playwright-core`: the image ships browsers, not it. */
  readonly coreDir: string;
}

/** Exported for direct testing only. */
export function captureBrowserRunArgs({
  image,
  hostPort,
  coreDir,
}: CaptureBrowserRunOptions): string[] {
  return [
    "run",
    "--detach",
    "--rm",
    // The image is multi-arch and the two rasterize differently; CI renders on
    // amd64. packages/admin/README.md has the measurement.
    "--platform",
    "linux/amd64",
    // Chromium's renderers share memory through /dev/shm, which docker sizes
    // at 64MB by default — small enough to crash a tab mid-capture.
    "--ipc=host",
    // `run-server` spawns browsers; without an init the container collects
    // their zombies until it runs out of pids.
    "--init",
    "--publish",
    `127.0.0.1:${String(hostPort)}:${String(CONTAINER_PORT)}`,
    "--volume",
    `${coreDir}:${MOUNTED_CORE}:ro`,
    image,
    "node",
    `${MOUNTED_CORE}/cli.js`,
    "run-server",
    "--port",
    String(CONTAINER_PORT),
    "--host",
    "0.0.0.0",
  ];
}

/**
 * Refuses a capture that would render in this machine's browser rather than in
 * the pinned container. Guards the accidental path — a bare `playwright test
 * --project screenshots` — not a hand-set variable.
 */
export function assertCaptureEndpoint(
  env: NodeJS.ProcessEnv = process.env,
): void {
  const endpoint = env[CAPTURE_ENDPOINT_ENV];
  if (endpoint === undefined || endpoint === "") {
    throw new Error(
      `${CAPTURE_ENDPOINT_ENV} is unset, so this run would render here and rewrite ` +
        `every image. Run \`pnpm docs:screenshots\`, which starts the pinned ` +
        `container and sets it.`,
    );
  }
}

export interface CaptureBrowser {
  readonly wsEndpoint: string;
  /** Idempotent: the runner calls it from both a signal and its own exit. */
  stop: () => void;
}

/**
 * Starts the pinned browser and waits for it to serve. The image is pulled on
 * first use, which `docker run` does before it prints the id, so the wait below
 * only ever covers the server's own startup.
 */
export async function startCaptureBrowser(): Promise<CaptureBrowser> {
  const image = captureBrowserImage();
  const hostPort = captureBrowserPort();
  const id = runDocker(
    captureBrowserRunArgs({ image, hostPort, coreDir: playwrightCoreDir() }),
    image,
  );

  let stopped = false;
  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    try {
      execFileSync("docker", ["rm", "--force", id], { stdio: "ignore" });
    } catch {
      // Teardown runs from a `finally`, and docker may have reaped the
      // container already. Whatever brought us here is the error worth having.
    }
  };

  try {
    await waitForServer(id);
  } catch (cause) {
    stop();
    throw cause;
  }
  return { wsEndpoint: `ws://127.0.0.1:${String(hostPort)}/`, stop };
}

function playwrightCoreDir(): string {
  return dirname(fromPlaywrightTest.resolve("playwright-core"));
}

function runDocker(args: string[], image: string): string {
  try {
    return execFileSync("docker", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    }).trim();
  } catch (cause) {
    // Docker's own reason is on stderr just above — a refused daemon, a port
    // another capture still holds, a platform this host cannot emulate. Say
    // what was being attempted and leave the diagnosis to it.
    throw new Error(
      `\`docker run\` failed. The documentation capture renders in \`${image}\` ` +
        `rather than in a local browser — see packages/admin/README.md.`,
      { cause },
    );
  }
}

/**
 * Waits for the marker rather than for the port: docker publishes the port when
 * it creates the container, so a TCP connect succeeds against the proxy about a
 * second before anything inside is listening.
 */
async function waitForServer(id: string): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  for (;;) {
    const log = containerLog(id);
    if (log === undefined) {
      throw new Error(
        "The capture browser exited as it started, and `--rm` took its logs with it.",
      );
    }
    if (log.includes(READY_MARKER)) return;
    if (Date.now() > deadline) {
      throw new Error(
        `The capture browser never reported "${READY_MARKER}" within ` +
          `${String(READY_TIMEOUT_MS)}ms.\n${log}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/** `undefined` when docker has no such container — it has already been reaped. */
function containerLog(id: string): string | undefined {
  try {
    return execFileSync("docker", ["logs", id], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    return undefined;
  }
}
