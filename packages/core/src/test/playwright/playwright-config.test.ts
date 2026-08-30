import { describe, expect, test } from "vitest";

import { definePlumixE2EConfig, resolveE2EPort } from "./playwright-config.js";

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
    const config = definePlumixE2EConfig({ playground: "../playground" });

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

  test("playground option bakes the worker-driven webServerCommand", () => {
    const config = definePlumixE2EConfig({
      port: 3040,
      playground: "../playground",
    });

    const cmd =
      config.webServer && "command" in config.webServer
        ? config.webServer.command
        : undefined;
    expect(cmd).toContain("cd ../playground");
    expect(cmd).toContain("rm -rf .wrangler/state drizzle");
    expect(cmd).toContain("plumix migrate generate");
    expect(cmd).toContain("wrangler d1 migrations apply DB --local");
    expect(cmd).toContain("plumix dev --port 3040");
  });

  test("applyMigrations=false drops the apply step but keeps migrate generate", () => {
    const config = definePlumixE2EConfig({
      port: 3070,
      playground: "../playground",
      applyMigrations: false,
    });

    const cmd =
      config.webServer && "command" in config.webServer
        ? config.webServer.command
        : undefined;
    expect(cmd).toContain("plumix migrate generate");
    expect(cmd).not.toContain("wrangler d1 migrations apply");
  });

  test("extraSetup injects an additional step between migrations apply and plumix dev", () => {
    const config = definePlumixE2EConfig({
      playground: "..",
      extraSetup:
        "pnpm exec wrangler d1 execute plumix_blog --local --file=e2e/seed.sql",
    });

    const cmd =
      config.webServer && "command" in config.webServer
        ? config.webServer.command
        : "";
    expect(cmd).toMatch(
      /wrangler d1 migrations apply DB --local && pnpm exec wrangler d1 execute plumix_blog --local --file=e2e\/seed\.sql && pnpm exec plumix dev --port \d+/,
    );
  });

  test("seedAdminSession=false skips globalSetup + storageState auto-wiring", () => {
    const config = definePlumixE2EConfig({
      playground: "..",
      seedAdminSession: false,
    });

    expect(config.globalSetup).toBeUndefined();
    expect(config.use?.storageState).toBeUndefined();
  });

  test("playground also auto-wires globalSetup + storageState by convention", () => {
    const config = definePlumixE2EConfig({
      port: 3040,
      playground: "../playground",
    });

    expect(config.globalSetup).toBe("./globalSetup.ts");
    expect(config.use?.storageState).toBe("./storageState.json");
  });

  test("rejects passing both playground and webServerCommand (mutually exclusive)", () => {
    expect(() =>
      definePlumixE2EConfig({
        port: 3040,
        playground: "../playground",
        webServerCommand: "custom",
      }),
    ).toThrow(/playground.*webServerCommand.*mutually exclusive/i);
  });

  test("rejects neither playground nor webServerCommand provided", () => {
    expect(() => definePlumixE2EConfig({ port: 3040 })).toThrow(
      /playground.*or.*webServerCommand/i,
    );
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
      const config = definePlumixE2EConfig({ playground: "../playground" });
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
      playground: "../playground",
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
      playground: "../playground",
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
      playground: "../playground",
    });

    const cmd =
      config.webServer && "command" in config.webServer
        ? config.webServer.command
        : "";
    expect(cmd).toContain("plumix dev --port 3020 --inspector-port 9320");
  });

  test("inspectorPort omitted leaves the dev command flag-free (auto-allocation default)", () => {
    const config = definePlumixE2EConfig({
      port: 3020,
      playground: "../playground",
    });

    const cmd =
      config.webServer && "command" in config.webServer
        ? config.webServer.command
        : "";
    expect(cmd).not.toContain("--inspector-port");
  });

  test("reuses no existing server, on CI and locally alike", () => {
    withCI(undefined, () => {
      const config = definePlumixE2EConfig({ playground: "../playground" });
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
      const config = definePlumixE2EConfig({ playground: "../playground" });

      expect(config.workers).toBe(1);
    });
  });

  test("applyMigrations: false means no shared D1, so workers stay parallel", () => {
    withCI("true", () => {
      const config = definePlumixE2EConfig({
        playground: "../playground",
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
        playground: "../playground",
      });

      expect(config.use?.baseURL).toBe("http://localhost:3110/_plumix/admin/");
      expect(webServerCommandOf(config)).toContain("plumix dev --port 3110");
    });
  });

  test("shifts the webServer readiness URL alongside the port", () => {
    withPortOffset("100", () => {
      const config = definePlumixE2EConfig({
        port: 3010,
        playground: "../playground",
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
        playground: "../playground",
      });
      const blog = definePlumixE2EConfig({
        port: 3020,
        inspectorPort: 9320,
        playground: "../playground",
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
        playground: "../playground",
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
      const config = definePlumixE2EConfig({ playground: "../playground" });

      expect(config.use?.baseURL).toBe("http://localhost:5273/_plumix/admin/");
    });
  });

  test("leaves every port untouched when unset", () => {
    withPortOffset(undefined, () => {
      const config = definePlumixE2EConfig({
        port: 3010,
        inspectorPort: 9310,
        playground: "../playground",
      });

      expect(config.use?.baseURL).toBe("http://localhost:3010/_plumix/admin/");
      expect(webServerCommandOf(config)).toContain(
        "plumix dev --port 3010 --inspector-port 9310",
      );
    });
  });
});
