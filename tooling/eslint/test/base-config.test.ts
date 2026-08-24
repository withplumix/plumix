import * as path from "node:path";
import type { Linter } from "eslint";
import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

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

async function reportsMatching(
  fixture: string,
  matches: (ruleId: string) => boolean,
): Promise<{ ruleId: string | null; line: number }[]> {
  return messagesMatching(fixture, matches, (message) => ({
    ruleId: message.ruleId,
    line: message.line,
  }));
}

async function messagesMatching<TReport>(
  fixture: string,
  matches: (ruleId: string) => boolean,
  project: (message: Linter.LintMessage) => TReport,
): Promise<TReport[]> {
  const [result] = await eslint.lintFiles([fixture]);
  return (result?.messages ?? [])
    .filter((message) => message.ruleId !== null && matches(message.ruleId))
    .map(project);
}

// The first `lintFiles` call builds the fixture TS program for the type-aware
// rules, and on a contended runner that alone outruns the 5s default. Pay it
// here rather than inside whichever test happens to run first, so every test's
// own timeout stays a hang detector — same cold-start spike as PR #1522.
beforeAll(async () => {
  await eslint.lintFiles(["src/restricted-syntax.ts"]);
}, 60_000);

const plumixReports = (fixture: string) =>
  reportsMatching(fixture, (ruleId) => ruleId.startsWith("plumix/"));

// The earned-types rules borrowed from typescript-eslint's strict preset.
// Named explicitly so a report from one of the presets the config already
// extends can't be mistaken for one of these.
const STRICT_PRESET_RULES = new Set([
  "@typescript-eslint/no-deprecated",
  "@typescript-eslint/no-unnecessary-boolean-literal-compare",
  "@typescript-eslint/no-unnecessary-type-arguments",
  "@typescript-eslint/no-unnecessary-type-conversion",
  "@typescript-eslint/no-unnecessary-type-parameters",
]);

const strictPresetReports = (fixture: string) =>
  reportsMatching(fixture, (ruleId) => STRICT_PRESET_RULES.has(ruleId));

async function restrictedSyntaxLines(
  instance: ESLint,
  fixture: string,
): Promise<number[]> {
  const [result] = await instance.lintFiles([fixture]);
  return (result?.messages ?? [])
    .filter((message) => message.ruleId === "no-restricted-syntax")
    .map((message) => message.line);
}

// The chained-assertion rule reports two distinct failures — no safety comment
// at all, and one that marks the assertion without stating why it is sound —
// so its assertions carry the message id as well as the position.
const chainedAssertionReports = (fixture: string) =>
  messagesMatching(
    fixture,
    (ruleId) => ruleId === "plumix/no-chained-type-assertion",
    (message) => ({ messageId: message.messageId, line: message.line }),
  );

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

describe("plumix/no-unknown-return", () => {
  it("rejects unknown and promise-of-unknown returns", async () => {
    await expect(
      plumixReports("src/unknown-return.violations.ts"),
    ).resolves.toEqual([
      { ruleId: "plumix/no-unknown-return", line: 1 },
      { ruleId: "plumix/no-unknown-return", line: 5 },
      { ruleId: "plumix/no-unknown-return", line: 7 },
      { ruleId: "plumix/no-unknown-return", line: 12 },
      { ruleId: "plumix/no-unknown-return", line: 13 },
      { ruleId: "plumix/no-unknown-return", line: 14 },
      { ruleId: "plumix/no-unknown-return", line: 18 },
      { ruleId: "plumix/no-unknown-return", line: 22 },
      { ruleId: "plumix/no-unknown-return", line: 29 },
      { ruleId: "plumix/no-unknown-return", line: 31 },
      { ruleId: "plumix/no-unknown-return", line: 35 },
    ]);
  });

  it("allows unknown inside a wider return, an externally fixed signature, and type-level patterns", async () => {
    await expect(
      plumixReports("src/unknown-return.allowed.ts"),
    ).resolves.toEqual([]);
  });
});

describe("plumix/no-bare-object-input", () => {
  it("rejects object as a parameter and as a property type", async () => {
    await expect(
      plumixReports("src/bare-object-input.violations.ts"),
    ).resolves.toEqual([
      { ruleId: "plumix/no-bare-object-input", line: 1 },
      { ruleId: "plumix/no-bare-object-input", line: 5 },
      { ruleId: "plumix/no-bare-object-input", line: 10 },
      { ruleId: "plumix/no-bare-object-input", line: 11 },
      { ruleId: "plumix/no-bare-object-input", line: 12 },
      { ruleId: "plumix/no-bare-object-input", line: 16 },
      { ruleId: "plumix/no-bare-object-input", line: 18 },
      { ruleId: "plumix/no-bare-object-input", line: 27 },
      { ruleId: "plumix/no-bare-object-input", line: 28 },
    ]);
  });

  it("stays silent on object inside a wider type and in a return position", async () => {
    await expect(
      plumixReports("src/bare-object-input.allowed.ts"),
    ).resolves.toEqual([]);
  });
});

describe("plumix/no-chained-type-assertion", () => {
  it("rejects an assertion routed through unknown", async () => {
    await expect(
      chainedAssertionReports("src/chained-assertion.violations.ts"),
    ).resolves.toEqual([
      { messageId: "chainedTypeAssertion", line: 6 },
      { messageId: "safetyCommentTooThin", line: 11 },
      { messageId: "chainedTypeAssertion", line: 18 },
      { messageId: "chainedTypeAssertion", line: 26 },
      { messageId: "chainedTypeAssertion", line: 32 },
    ]);
  });

  it("permits one whose preceding safety comment states an invariant", async () => {
    await expect(
      chainedAssertionReports("src/chained-assertion.allowed.ts"),
    ).resolves.toEqual([]);
  });

  it("stays silent on assertions not routed through unknown", async () => {
    await expect(
      plumixReports("src/chained-assertion.allowed.ts"),
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

describe("plumix/no-module-mocking", () => {
  it("rejects every module-path mocking helper in a test file", async () => {
    await expect(
      plumixReports("src/module-mocking.violations.test.ts"),
    ).resolves.toEqual([
      { ruleId: "plumix/no-module-mocking", line: 14 },
      { ruleId: "plumix/no-module-mocking", line: 16 },
      { ruleId: "plumix/no-module-mocking", line: 18 },
      { ruleId: "plumix/no-module-mocking", line: 20 },
      { ruleId: "plumix/no-module-mocking", line: 22 },
      { ruleId: "plumix/no-module-mocking", line: 24 },
    ]);
  });

  it("stays silent on spies, stubbed globals and unrelated `mock` methods", async () => {
    await expect(
      plumixReports("src/module-mocking.allowed.test.ts"),
    ).resolves.toEqual([]);
  });

  it("stays silent in production source", async () => {
    await expect(
      plumixReports("src/module-mocking.production.ts"),
    ).resolves.toEqual([]);
  });
});

describe("the earned-types rules from the strict preset", () => {
  it("rejects deprecated APIs and types that were declared rather than earned", async () => {
    await expect(
      strictPresetReports("src/strict-preset.violations.ts"),
    ).resolves.toEqual([
      { ruleId: "@typescript-eslint/no-deprecated", line: 6 },
      { ruleId: "@typescript-eslint/no-unnecessary-type-parameters", line: 8 },
      { ruleId: "@typescript-eslint/no-unnecessary-type-arguments", line: 16 },
      { ruleId: "@typescript-eslint/no-unnecessary-type-conversion", line: 19 },
      {
        ruleId: "@typescript-eslint/no-unnecessary-boolean-literal-compare",
        line: 23,
      },
    ]);
  });

  it("stays silent on type parameters, arguments, conversions and comparisons that earn their keep", async () => {
    await expect(
      strictPresetReports("src/strict-preset.allowed.ts"),
    ).resolves.toEqual([]);
  });
});

describe("scoping", () => {
  it("stays silent in test files", async () => {
    await expect(plumixReports("src/carve-out.test.ts")).resolves.toEqual([]);
  });

  // The single-use type parameter rule is the one strict-preset rule scoped to
  // production source; the other four apply everywhere. Assert the split from
  // one fixture that violates all five, so neither half can drift unnoticed.
  it("exempts test files from the single-use type parameter rule only", async () => {
    await expect(strictPresetReports("src/carve-out.test.ts")).resolves.toEqual(
      [
        { ruleId: "@typescript-eslint/no-deprecated", line: 23 },
        {
          ruleId: "@typescript-eslint/no-unnecessary-type-arguments",
          line: 29,
        },
        {
          ruleId: "@typescript-eslint/no-unnecessary-type-conversion",
          line: 32,
        },
        {
          ruleId: "@typescript-eslint/no-unnecessary-boolean-literal-compare",
          line: 36,
        },
      ],
    );
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
