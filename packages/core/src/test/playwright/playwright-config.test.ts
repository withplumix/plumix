import { describe, expect, test } from "vitest";

import { definePlumixE2EConfig } from "./playwright-config.js";

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
    expect(cmd).toContain("rm -rf .wrangler/state");
    expect(cmd).toContain("plumix migrate generate");
    expect(cmd).toContain("wrangler d1 migrations apply DB --local");
    expect(cmd).toContain("plumix dev --port 3040");
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
});
