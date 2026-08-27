import { describe, expect, it } from "vitest";

import type { PortConflict, SuitePorts } from "../ports.js";
import {
  describePortConflict,
  discoverPlaywrightConfigs,
  findPortConflicts,
  parsePortClaims,
  readSuitePorts,
  REPO_ROOT,
} from "../ports.js";

function suite(
  packageName: string,
  file: string,
  claims: Record<string, number>,
): SuitePorts {
  return {
    packageName,
    file,
    claims: Object.entries(claims).map(([option, port]) => ({ option, port })),
    unresolved: [],
  };
}

describe("parsePortClaims", () => {
  it("reads a port declared as a literal", () => {
    expect(
      parsePortClaims("definePlumixE2EConfig({ port: 3080 })").claims,
    ).toEqual([{ option: "port", port: 3080 }]);
  });

  it("reads every port option a config declares", () => {
    const source = `definePlumixE2EConfig({
      port: 3080,
      inspectorPort: 9380,
    });`;
    expect(parsePortClaims(source).claims).toEqual([
      { option: "port", port: 3080 },
      { option: "inspectorPort", port: 9380 },
    ]);
  });

  it("resolves a port held in a file-local const, as the admin suites declare theirs", () => {
    const source = `const E2E_PORT_BASE = 5180;
      definePlumixE2EConfig({ port: E2E_PORT_BASE });`;
    expect(parsePortClaims(source).claims).toEqual([
      { option: "port", port: 5180 },
    ]);
  });

  it("ignores `viewport`, the one option whose name ends in port and binds nothing", () => {
    const source = "use: { viewport: { width: 1280, height: 800 } }";
    expect(parsePortClaims(source)).toEqual({ claims: [], unresolved: [] });
  });

  it("ignores a port a comment mentions, so the allocation can be written down", () => {
    const source = `// port: 3070 belongs to apps/demo.
      definePlumixE2EConfig({ port: 3080 });`;
    expect(parsePortClaims(source).claims).toEqual([
      { option: "port", port: 3080 },
    ]);
  });

  it("reads a port a custom webServerCommand hard-codes on its command line", () => {
    const source =
      'webServerCommand: "pnpm exec vite preview --port 5180 --strictPort"';
    expect(parsePortClaims(source).claims).toEqual([
      { option: "--port", port: 5180 },
    ]);
  });

  it("does not double-count a command line that interpolates the declared port", () => {
    const source = `const E2E_PORT_BASE = 5180;
      definePlumixE2EConfig({
        port: E2E_PORT_BASE,
        webServerCommand: \`vite preview --port \${String(E2E_PORT)}\`,
      });`;
    expect(parsePortClaims(source).claims).toEqual([
      { option: "port", port: 5180 },
    ]);
  });

  it("ignores a port a block comment mentions", () => {
    const source = `/* Was port: 3070, moved when apps/demo took it. */
      definePlumixE2EConfig({ port: 3080 });`;
    expect(parsePortClaims(source).claims).toEqual([
      { option: "port", port: 3080 },
    ]);
  });

  it("reports a port it cannot resolve rather than passing over it", () => {
    const source = "definePlumixE2EConfig({ port: PORTS.og });";
    expect(parsePortClaims(source)).toEqual({
      claims: [],
      unresolved: [{ option: "port", expression: "PORTS.og" }],
    });
  });
});

describe("findPortConflicts", () => {
  it("passes an estate where every suite binds its own ports", () => {
    expect(
      findPortConflicts([
        suite("@plumix/plugin-og", "og.ts", {
          port: 3080,
          inspectorPort: 9380,
        }),
        suite("@plumix-apps/demo", "demo.ts", {
          port: 3070,
          inspectorPort: 9370,
        }),
      ]),
    ).toEqual([]);
  });

  it("reports a port two suites claim", () => {
    const conflicts = findPortConflicts([
      suite("@plumix-apps/demo", "demo.ts", { port: 3070 }),
      suite("@plumix/plugin-og", "og.ts", { port: 3070 }),
    ]);
    expect(conflicts).toEqual([
      {
        port: 3070,
        claims: [
          { packageName: "@plumix-apps/demo", file: "demo.ts", option: "port" },
          { packageName: "@plumix/plugin-og", file: "og.ts", option: "port" },
        ],
      },
    ]);
  });

  it("reports one suite's HTTP port taken as another's inspector port", () => {
    const conflicts = findPortConflicts([
      suite("@plumix/plugin-og", "og.ts", { port: 9380 }),
      suite("@plumix/plugin-blog", "blog.ts", { inspectorPort: 9380 }),
    ]);
    expect(conflicts.map((conflict) => conflict.port)).toEqual([9380]);
  });

  it("leaves a suite that names one port twice alone — it is one listener, and it fails on its own", () => {
    expect(
      findPortConflicts([
        suite("@plumix/plugin-og", "og.ts", {
          port: 3080,
          webServerPort: 3080,
        }),
      ]),
    ).toEqual([]);
  });
});

describe("describePortConflict", () => {
  const conflict: PortConflict = {
    port: 3070,
    claims: [
      {
        packageName: "@plumix-apps/demo",
        file: "apps/demo/e2e/playwright.config.ts",
        option: "port",
      },
      {
        packageName: "@plumix/plugin-og",
        file: "packages/plugins/og/e2e/playwright.config.ts",
        option: "port",
      },
    ],
  };
  const message = describePortConflict(conflict);

  it("names both colliding packages, which the failure itself never does", () => {
    expect(message).toContain("@plumix-apps/demo");
    expect(message).toContain("@plumix/plugin-og");
  });

  it("names the config file each claim comes from", () => {
    expect(message).toContain("packages/plugins/og/e2e/playwright.config.ts");
  });
});

describe("this repository", () => {
  const suites = discoverPlaywrightConfigs(REPO_ROOT).map((file) =>
    readSuitePorts(REPO_ROOT, file),
  );

  it("finds every e2e suite", () => {
    // A discovery that silently found nothing would pass every check below.
    expect(suites.length).toBeGreaterThanOrEqual(10);
  });

  it("declares every port as a literal or a file-local const, so this guard can read it", () => {
    expect(
      suites.flatMap(({ file, unresolved }) =>
        unresolved.map(
          ({ option, expression }) => `${file}: \`${option}: ${expression}\``,
        ),
      ),
    ).toEqual([]);
  });

  it("binds a port no other suite claims", () => {
    expect(
      findPortConflicts(suites).map(describePortConflict).join("\n\n"),
    ).toBe("");
  });
});
