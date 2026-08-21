import * as path from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

import { baseConfig } from "../base.js";
import { reactConfig } from "../react.js";

// The seam is taken as high as it goes: fixtures on disk are linted through
// the real exported flat config, so a rule that is correct but unregistered —
// or registered against the wrong file glob — fails here just as loudly as a
// broken visitor.
const fixturesDir = path.join(import.meta.dirname, "fixtures");

const eslint = new ESLint({
  cwd: fixturesDir,
  overrideConfigFile: true,
  overrideConfig: baseConfig,
});

async function plumixReports(
  fixture: string,
): Promise<{ ruleId: string | null; line: number }[]> {
  const [result] = await eslint.lintFiles([fixture]);
  return (result?.messages ?? [])
    .filter((message) => message.ruleId?.startsWith("plumix/") === true)
    .map((message) => ({ ruleId: message.ruleId, line: message.line }));
}

async function restrictedSyntaxLines(
  instance: ESLint,
  fixture: string,
): Promise<number[]> {
  const [result] = await instance.lintFiles([fixture]);
  return (result?.messages ?? [])
    .filter((message) => message.ruleId === "no-restricted-syntax")
    .map((message) => message.line);
}

describe("plumix/no-reflect-get and plumix/no-reflect-apply", () => {
  it("rejects Reflect.get and Reflect.apply", async () => {
    await expect(plumixReports("src/reflect.violations.ts")).resolves.toEqual([
      { ruleId: "plumix/no-reflect-get", line: 6 },
      { ruleId: "plumix/no-reflect-apply", line: 10 },
      { ruleId: "plumix/no-reflect-get", line: 16 },
    ]);
  });

  it("stays silent on other Reflect members and on ordinary get/apply calls", async () => {
    await expect(plumixReports("src/reflect.allowed.ts")).resolves.toEqual([]);
  });
});

describe("plumix/no-unknown-type-alias", () => {
  it("rejects a type alias defined as unknown", async () => {
    await expect(
      plumixReports("src/unknown-type-alias.violations.ts"),
    ).resolves.toEqual([
      { ruleId: "plumix/no-unknown-type-alias", line: 1 },
      { ruleId: "plumix/no-unknown-type-alias", line: 3 },
    ]);
  });

  it("stays silent on unknown used inside a wider type", async () => {
    await expect(
      plumixReports("src/unknown-type-alias.allowed.ts"),
    ).resolves.toEqual([]);
  });
});

describe("plumix/no-non-testid-queries", () => {
  it("rejects role, label and text queries in a test file", async () => {
    await expect(
      plumixReports("src/testid-queries.violations.test.ts"),
    ).resolves.toEqual([
      { ruleId: "plumix/no-non-testid-queries", line: 12 },
      { ruleId: "plumix/no-non-testid-queries", line: 16 },
      { ruleId: "plumix/no-non-testid-queries", line: 23 },
    ]);
  });

  it("rejects role and placeholder locators in an e2e spec", async () => {
    await expect(plumixReports("e2e/testid-queries.spec.ts")).resolves.toEqual([
      { ruleId: "plumix/no-non-testid-queries", line: 15 },
      { ruleId: "plumix/no-non-testid-queries", line: 19 },
    ]);
  });

  it("stays silent on test-id queries and on data-testid locators", async () => {
    await expect(
      plumixReports("src/testid-queries.allowed.test.ts"),
    ).resolves.toEqual([]);
  });

  it("stays silent in production source", async () => {
    await expect(
      plumixReports("src/testid-queries.production.ts"),
    ).resolves.toEqual([]);
  });
});

describe("scoping", () => {
  it("stays silent in test files", async () => {
    await expect(plumixReports("src/carve-out.test.ts")).resolves.toEqual([]);
  });

  it("stays silent outside src", async () => {
    await expect(plumixReports("scripts/carve-out.ts")).resolves.toEqual([]);
  });
});

// Flat config replaces a rule's configuration wholesale rather than merging
// it, so every config that re-declares `no-restricted-syntax` carries its own
// full selector list. Assert both lists still fire after the new plugin block
// lands between them.
describe("the existing restricted-syntax selectors", () => {
  it("still reports throw new Error and internal augmentation targets", async () => {
    await expect(
      restrictedSyntaxLines(eslint, "src/restricted-syntax.ts"),
    ).resolves.toEqual([2, 7]);
  });

  it("still reports physical CSS classes under the react config", async () => {
    const withReact = new ESLint({
      cwd: fixturesDir,
      overrideConfigFile: true,
      overrideConfig: [...baseConfig, ...reactConfig],
    });
    await expect(
      restrictedSyntaxLines(withReact, "src/physical-class.tsx"),
    ).resolves.toEqual([1]);
  });
});
