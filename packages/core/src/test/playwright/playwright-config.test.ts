import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { ChildProcess } from "node:child_process";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  CLOUDFLARE_E2E,
  runtimePackage,
  usePlaygrounds,
} from "./playground-fixture.js";
import {
  definePlumixE2EConfig,
  resolveE2EPort,
  superviseWebServer,
} from "./playwright-config.js";

const playground = usePlaygrounds();

// The helper reads the runtime's `plumix.e2e` block off the playground the
// config names, so every test gets one on disk, with an `e2e` directory
// inside it standing in for the config file's directory.
let configDir = "";

beforeEach(async () => {
  const dir = await playground([
    { name: "plumix" },
    runtimePackage("@plumix/runtime-cloudflare", CLOUDFLARE_E2E),
  ]);
  configDir = join(dir, "e2e");
  await mkdir(configDir);
});

function withPortOffset<T>(value: string | undefined, fn: () => T): T {
  const original = process.env.PLUMIX_E2E_PORT_OFFSET;
  if (value === undefined) delete process.env.PLUMIX_E2E_PORT_OFFSET;
  else process.env.PLUMIX_E2E_PORT_OFFSET = value;
  try {
    return fn();
  } finally {
    if (original === undefined) delete process.env.PLUMIX_E2E_PORT_OFFSET;
    else process.env.PLUMIX_E2E_PORT_OFFSET = original;
  }
}

function withCI<T>(value: string | undefined, fn: () => T): T {
  const original = process.env.CI;
  if (value === undefined) delete process.env.CI;
  else process.env.CI = value;
  try {
    return fn();
  } finally {
    if (original === undefined) delete process.env.CI;
    else process.env.CI = original;
  }
}

function webServerCommandOf(config: ReturnType<typeof definePlumixE2EConfig>) {
  return config.webServer && "command" in config.webServer
    ? config.webServer.command
    : "";
}

function readinessUrlOf(config: ReturnType<typeof definePlumixE2EConfig>) {
  return config.webServer && "url" in config.webServer
    ? config.webServer.url
    : undefined;
}

describe("definePlumixE2EConfig", () => {
  test("derives baseURL from port when not explicitly set", () => {
    const config = definePlumixE2EConfig({
      port: 3040,
      webServerCommand: "noop",
    });

    expect(config.use?.baseURL).toBe("http://localhost:3040/_plumix/admin/");
  });

  test("port defaults to 5173 (vite's default) when omitted", () => {
    const config = definePlumixE2EConfig({ configDir, playground: ".." });

    expect(config.use?.baseURL).toBe("http://localhost:5173/_plumix/admin/");
  });

  test("uses explicit baseURL when provided", () => {
    const config = definePlumixE2EConfig({
      port: 3040,
      baseURL: "http://localhost:3040/custom/",
      webServerCommand: "noop",
    });

    expect(config.use?.baseURL).toBe("http://localhost:3040/custom/");
  });

  test("playground option bakes the runtime-driven webServerCommand", () => {
    const config = definePlumixE2EConfig({
      port: 3040,
      configDir,
      playground: "..",
    });

    const cmd = webServerCommandOf(config);
    expect(cmd).toBe(
      superviseWebServer(
        "cd .. && pnpm exec plumix migrate fresh && pnpm exec plumix dev --port 3040",
      ),
    );
  });

  test("generates and deletes nothing, so a committed drizzle/ survives the run (#2819)", () => {
    const cmd = webServerCommandOf(
      definePlumixE2EConfig({ configDir, playground: ".." }),
    );

    expect(cmd).not.toContain("rm -rf");
    expect(cmd).not.toContain("drizzle");
    expect(cmd).not.toContain("migrate generate");
  });

  test("a runtime's cli prefix runs migrate fresh and dev in place of pnpm exec plumix", async () => {
    const bunPlayground = await playground([
      runtimePackage("@plumix/runtime-bun", {
        cli: "bun --bun node_modules/plumix/bin/plumix.mjs",
        wipe: ["data"],
        database: { glob: "data/*.sqlite" },
      }),
    ]);

    const config = definePlumixE2EConfig({
      port: 3130,
      configDir: bunPlayground,
      playground: ".",
    });

    expect(webServerCommandOf(config)).toBe(
      superviseWebServer(
        "cd . && bun --bun node_modules/plumix/bin/plumix.mjs migrate fresh && bun --bun node_modules/plumix/bin/plumix.mjs dev --port 3130",
      ),
    );
  });

  test("extraSetup injects an additional step between migrate fresh and plumix dev", () => {
    const config = definePlumixE2EConfig({
      configDir,
      playground: "..",
      extraSetup: "pnpm exec plumix seed --file=e2e/seed.sql",
    });

    expect(webServerCommandOf(config)).toMatch(
      /plumix migrate fresh && pnpm exec plumix seed --file=e2e\/seed\.sql && pnpm exec plumix dev --port \d+/,
    );
  });

  test("seedAdminSession=false skips globalSetup + storageState auto-wiring", () => {
    const config = definePlumixE2EConfig({
      configDir,
      playground: "..",
      seedAdminSession: false,
    });

    expect(config.globalSetup).toBeUndefined();
    expect(config.use?.storageState).toBeUndefined();
  });

  test("playground also auto-wires globalSetup + storageState by convention", () => {
    const config = definePlumixE2EConfig({
      port: 3040,
      configDir,
      playground: "..",
    });

    expect(config.globalSetup).toBe("./globalSetup.ts");
    expect(config.use?.storageState).toBe("./storageState.json");
  });

  test("rejects passing both playground and webServerCommand (mutually exclusive)", () => {
    expect(() =>
      definePlumixE2EConfig({
        port: 3040,
        configDir,
        playground: "..",
        webServerCommand: "custom",
      }),
    ).toThrow(/playground.*webServerCommand.*mutually exclusive/i);
  });

  test("rejects neither playground nor webServerCommand provided", () => {
    expect(() => definePlumixE2EConfig({ port: 3040 })).toThrow(
      /playground.*or.*webServerCommand/i,
    );
  });

  test("rejects a playground without the configDir it is relative to", () => {
    expect(() =>
      definePlumixE2EConfig({ playground: "../playground" }),
    ).toThrow(/configDir.*import\.meta\.dirname/);
  });

  test("rejects inspectorPort paired with a custom webServerCommand", () => {
    expect(() =>
      definePlumixE2EConfig({
        port: 3040,
        inspectorPort: 9340,
        webServerCommand: "custom",
      }),
    ).toThrow(/inspectorPort.*webServerCommand/i);
  });

  test("CI reporter writes the html report with open: never", () => {
    withCI("true", () => {
      const config = definePlumixE2EConfig({ configDir, playground: ".." });
      const reporters = Array.isArray(config.reporter) ? config.reporter : [];
      const htmlReporter = reporters.find(
        (entry): entry is ["html", { open?: string }] =>
          Array.isArray(entry) && entry[0] === "html",
      );
      expect(htmlReporter?.[1]?.open).toBe("never");
    });
  });

  test("a playground's readiness waits on a request the Plumix handler answers, not the admin shell", () => {
    const config = definePlumixE2EConfig({
      port: 3040,
      configDir,
      playground: "..",
    });

    expect(readinessUrlOf(config)).toBe(
      "http://localhost:3040/_plumix/auth/magic-link/verify",
    );
  });

  test("a custom webServerCommand's readiness polls baseURL", () => {
    const config = definePlumixE2EConfig({
      port: 3040,
      webServerCommand: "noop",
    });

    expect(readinessUrlOf(config)).toBe("http://localhost:3040/_plumix/admin/");
  });

  test("webServerPort override switches readiness to TCP port", () => {
    const config = definePlumixE2EConfig({
      port: 3040,
      configDir,
      playground: "..",
      webServerPort: 3040,
    });

    const port =
      config.webServer && "port" in config.webServer
        ? config.webServer.port
        : undefined;
    expect(port).toBe(3040);
  });

  test("inspectorPort threads through as --inspector-port on plumix dev", () => {
    const config = definePlumixE2EConfig({
      port: 3020,
      inspectorPort: 9320,
      configDir,
      playground: "..",
    });

    expect(webServerCommandOf(config)).toContain(
      "plumix dev --port 3020 --inspector-port 9320",
    );
  });

  test("inspectorPort omitted leaves the dev command flag-free (auto-allocation default)", () => {
    const config = definePlumixE2EConfig({
      port: 3020,
      configDir,
      playground: "..",
    });

    expect(webServerCommandOf(config)).not.toContain("--inspector-port");
  });

  test("reuses no existing server, on CI and locally alike", () => {
    withCI(undefined, () => {
      const config = definePlumixE2EConfig({ configDir, playground: ".." });
      const reuse =
        config.webServer && "reuseExistingServer" in config.webServer
          ? config.webServer.reuseExistingServer
          : undefined;
      expect(reuse).toBe(false);
    });
  });

  test("a suite with no shared database runs parallel workers on CI", () => {
    withCI("true", () => {
      const config = definePlumixE2EConfig({
        port: 3040,
        webServerCommand: "noop",
      });

      expect(config.workers).toBeUndefined();
    });
  });

  test("a playground pins to one worker — its D1 is shared mutable state", () => {
    withCI("true", () => {
      const config = definePlumixE2EConfig({ configDir, playground: ".." });

      expect(config.workers).toBe(1);
    });
  });

  test("sharedDatabase: false means no shared D1, so workers stay parallel and nothing is snapshotted", () => {
    withCI("true", () => {
      const config = definePlumixE2EConfig({
        configDir,
        playground: "..",
        sharedDatabase: false,
      });

      expect(config.workers).toBeUndefined();
      expect(config.use?.plumixPlayground).toBeUndefined();
      // The baked command still runs: only the shared-database pinning goes.
      expect(webServerCommandOf(config)).toContain("plumix migrate fresh");
    });
  });
});

describe("PLUMIX_E2E_PORT_OFFSET", () => {
  test("resolveE2EPort is the identity when the offset is unset", () => {
    withPortOffset(undefined, () => {
      expect(resolveE2EPort(3010)).toBe(3010);
    });
  });

  test("resolveE2EPort shifts the base by the offset", () => {
    withPortOffset("100", () => {
      expect(resolveE2EPort(3010)).toBe(3110);
    });
  });

  test("a negative offset shifts downward", () => {
    withPortOffset("-10", () => {
      expect(resolveE2EPort(3010)).toBe(3000);
    });
  });

  test("an empty offset is treated as unset", () => {
    withPortOffset("   ", () => {
      expect(resolveE2EPort(3010)).toBe(3010);
    });
  });

  test("a non-integer offset is rejected loudly rather than yielding NaN ports", () => {
    withPortOffset("wat", () => {
      expect(() => resolveE2EPort(3010)).toThrow(
        /PLUMIX_E2E_PORT_OFFSET.*integer/i,
      );
    });
    withPortOffset("1.5", () => {
      expect(() => resolveE2EPort(3010)).toThrow(
        /PLUMIX_E2E_PORT_OFFSET.*integer/i,
      );
    });
  });

  test("shifts the HTTP port and the derived baseURL together", () => {
    withPortOffset("100", () => {
      const config = definePlumixE2EConfig({
        port: 3010,
        configDir,
        playground: "..",
      });

      expect(config.use?.baseURL).toBe("http://localhost:3110/_plumix/admin/");
      expect(webServerCommandOf(config)).toContain("plumix dev --port 3110");
    });
  });

  test("shifts the webServer readiness URL alongside the port", () => {
    withPortOffset("100", () => {
      const config = definePlumixE2EConfig({
        port: 3010,
        configDir,
        playground: "..",
      });

      expect(readinessUrlOf(config)).toBe(
        "http://localhost:3110/_plumix/auth/magic-link/verify",
      );
    });
  });

  test("shifts the workerd inspector port too, preserving suite spacing", () => {
    withPortOffset("100", () => {
      const audit = definePlumixE2EConfig({
        port: 3010,
        inspectorPort: 9310,
        configDir,
        playground: "..",
      });
      const blog = definePlumixE2EConfig({
        port: 3020,
        inspectorPort: 9320,
        configDir,
        playground: "..",
      });

      expect(webServerCommandOf(audit)).toContain(
        "plumix dev --port 3110 --inspector-port 9410",
      );
      expect(webServerCommandOf(blog)).toContain(
        "plumix dev --port 3120 --inspector-port 9420",
      );
    });
  });

  test("shifts the TCP readiness port so it still matches the bound port", () => {
    withPortOffset("100", () => {
      const config = definePlumixE2EConfig({
        port: 3010,
        configDir,
        playground: "..",
        webServerPort: 3010,
      });

      const port =
        config.webServer && "port" in config.webServer
          ? config.webServer.port
          : undefined;
      expect(port).toBe(3110);
    });
  });

  test("shifts the default port when the suite declares none", () => {
    withPortOffset("100", () => {
      const config = definePlumixE2EConfig({ configDir, playground: ".." });

      expect(config.use?.baseURL).toBe("http://localhost:5273/_plumix/admin/");
    });
  });

  test("leaves every port untouched when unset", () => {
    withPortOffset(undefined, () => {
      const config = definePlumixE2EConfig({
        port: 3010,
        inspectorPort: 9310,
        configDir,
        playground: "..",
      });

      expect(config.use?.baseURL).toBe("http://localhost:3010/_plumix/admin/");
      expect(webServerCommandOf(config)).toContain(
        "plumix dev --port 3010 --inspector-port 9310",
      );
    });
  });
});

// Playwright kills the web server's process group only from its own teardown,
// which a runner stopped by SIGTERM or SIGKILL never reaches.
describe("the web server's lifetime", () => {
  let server: ChildProcess | undefined;

  afterEach(() => {
    if (server?.pid === undefined) return;
    try {
      process.kill(-server.pid, "SIGKILL");
    } catch {
      // Already gone, which is what the test wants.
    }
  });

  // Spawned the way Playwright spawns `webServer.command`: through a shell,
  // as the leader of a new process group, with a pipe on stdin that only the
  // runner holds.
  async function startServer(pidFile: string): Promise<ChildProcess> {
    const config = definePlumixE2EConfig({
      port: 3990,
      webServerCommand: `sleep 300 & echo $! > '${pidFile}'; wait`,
    });
    const child = spawn(webServerCommandOf(config), {
      shell: true,
      detached: true,
      stdio: ["pipe", "ignore", "ignore"],
    });
    await vi.waitFor(() => readFileSync(pidFile, "utf8").trim() !== "", {
      timeout: 5000,
    });
    return child;
  }

  const isRunning = (pid: number): boolean => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };

  test("stops when the runner that started it goes away", async () => {
    const pidFile = join(configDir, "server.pid");
    server = await startServer(pidFile);
    const pid = Number(readFileSync(pidFile, "utf8"));

    // The runner's end of the pipe closes however the runner died.
    server.stdin?.destroy();

    await vi.waitFor(() => expect(isRunning(pid)).toBe(false), {
      timeout: 5000,
    });
  });

  test("keeps serving while the runner is alive", async () => {
    const pidFile = join(configDir, "server.pid");
    server = await startServer(pidFile);
    const pid = Number(readFileSync(pidFile, "utf8"));

    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(isRunning(pid)).toBe(true);
  });
});
