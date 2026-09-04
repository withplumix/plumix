import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, test } from "vitest";

import {
  CLOUDFLARE_E2E,
  runtimePackage,
  usePlaygrounds,
} from "./playground-fixture.js";
import { definePlumixE2EConfig, resolveE2EPort } from "./playwright-config.js";

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
      "cd .. && rm -rf .wrangler/state drizzle && pnpm exec plumix migrate generate && pnpm exec plumix migrate apply && pnpm exec plumix dev --port 3040",
    );
    // The runtime's paths may name its tooling; no step may invoke it.
    expect(
      cmd.split(" && ").filter((step) => step.includes("wrangler")),
    ).toEqual(["rm -rf .wrangler/state drizzle"]);
  });

  test("the wipe list is the runtime's, not the helper's", async () => {
    const nodePlayground = await playground([
      runtimePackage("@plumix/runtime-node", {
        wipe: ["data", ".plumix"],
        database: { glob: "data/plumix.sqlite" },
      }),
    ]);

    const config = definePlumixE2EConfig({
      configDir: nodePlayground,
      playground: ".",
    });

    expect(webServerCommandOf(config)).toContain(
      "cd . && rm -rf data .plumix drizzle && ",
    );
  });

  test("applyMigrations=false drops the apply step but keeps migrate generate", () => {
    const config = definePlumixE2EConfig({
      port: 3070,
      configDir,
      playground: "..",
      applyMigrations: false,
    });

    const cmd = webServerCommandOf(config);
    expect(cmd).toContain("plumix migrate generate");
    expect(cmd).not.toContain("plumix migrate apply");
  });

  test("extraSetup injects an additional step between migrations apply and plumix dev", () => {
    const config = definePlumixE2EConfig({
      configDir,
      playground: "..",
      extraSetup: "pnpm exec plumix seed --file=e2e/seed.sql",
    });

    expect(webServerCommandOf(config)).toMatch(
      /plumix migrate apply && pnpm exec plumix seed --file=e2e\/seed\.sql && pnpm exec plumix dev --port \d+/,
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

  test("webServer readiness defaults to URL-based polling against baseURL", () => {
    const config = definePlumixE2EConfig({
      port: 3040,
      configDir,
      playground: "..",
    });

    const url =
      config.webServer && "url" in config.webServer
        ? config.webServer.url
        : undefined;
    expect(url).toBe("http://localhost:3040/_plumix/admin/");
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

  test("applyMigrations: false means no shared D1, so workers stay parallel", () => {
    withCI("true", () => {
      const config = definePlumixE2EConfig({
        configDir,
        playground: "..",
        applyMigrations: false,
      });

      expect(config.workers).toBeUndefined();
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

      const url =
        config.webServer && "url" in config.webServer
          ? config.webServer.url
          : undefined;
      expect(url).toBe("http://localhost:3110/_plumix/admin/");
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
