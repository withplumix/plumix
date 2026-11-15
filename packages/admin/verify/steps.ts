import { stripVTControlCharacters } from "node:util";
import type { BrowserContext, Page } from "@playwright/test";
import { expect } from "@playwright/test";

export type Expect = typeof expect;

/** Each kind of record a playground's seeder wrote, by the names it gave them. */
export type Seeded = Readonly<Record<string, readonly string[]>>;

/**
 * What a `--steps` file's default export takes. `page` and `context` are the
 * Playwright fixtures of those names, so a step's body reads as a test's.
 */
export interface StepFixtures {
  readonly page: Page;
  readonly context: BrowserContext;
  /** Playwright's `expect`, counting each assertion that holds as a passed step. */
  readonly expect: Expect;
  /** What the playground's seeder wrote, by kind; empty without `--seed`. */
  readonly seeded: Seeded;
  readonly role: string;
  /** The playground, by the name `--site` takes. */
  readonly site: string;
}

export type Steps = (fixtures: StepFixtures) => Promise<void>;

export interface StepsOutcome {
  /** How many assertions held. */
  readonly passed: number;
  readonly failed: readonly {
    readonly message: string;
    readonly screenshot: string;
  }[];
}

/** Matchers that call `onPass` each time one holds; `not` and `resolves` included. */
function countingMatchers<T extends object>(
  matchers: T,
  onPass: () => void,
): T {
  return new Proxy(matchers, {
    get(target, key) {
      const value: unknown = Reflect.get(target, key);
      if (typeof value === "object" && value !== null) {
        return countingMatchers(value, onPass);
      }
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        const result: unknown = Reflect.apply(value, target, args);
        if (!(result instanceof Promise)) {
          onPass();
          return result;
        }
        return result.then((settled: unknown) => {
          onPass();
          return settled;
        });
      };
    },
  });
}

function countingExpect(base: Expect, onPass: () => void): Expect {
  return new Proxy(base, {
    apply(target, thisArg, args: Parameters<Expect>) {
      return countingMatchers(Reflect.apply(target, thisArg, args), onPass);
    },
    get(target, key) {
      switch (key) {
        case "soft":
          return (...args: Parameters<Expect["soft"]>) =>
            countingMatchers(target.soft(...args), onPass);
        case "poll":
          return (...args: Parameters<Expect["poll"]>) =>
            countingMatchers(target.poll(...args), onPass);
        case "configure":
          return (...args: Parameters<Expect["configure"]>) =>
            countingExpect(target.configure(...args), onPass);
        default:
          return Reflect.get(target, key) as unknown;
      }
    },
  });
}

export async function runSteps(
  run: (assert: Expect) => Promise<void> | void,
  screenshot: string,
): Promise<StepsOutcome> {
  let passed = 0;
  try {
    await run(
      countingExpect(expect, () => {
        passed += 1;
      }),
    );
  } catch (error) {
    return {
      passed,
      failed: [
        {
          message: stripVTControlCharacters(
            error instanceof Error ? error.message : String(error),
          ),
          screenshot,
        },
      ],
    };
  }
  return { passed, failed: [] };
}
