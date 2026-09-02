import { describe, expect, test } from "vitest";

/**
 * One assertion of a slot contract. Kept as data rather than a bare `test`
 * call so a guard test can run the same case outside vitest's collector and
 * prove the suite is able to go red — see {@link failingCases}.
 */
export interface ContractCase<TOptions> {
  readonly name: string;
  /**
   * Reason the case does not apply to this implementation, or `null` to run
   * it. A backend that rejects sub-minute TTLs, for instance, is never asked
   * to honour one.
   */
  readonly skip?: (options: TOptions) => string | null;
  readonly run: (options: TOptions) => Promise<void>;
}

function skipReason<TOptions>(
  contractCase: ContractCase<TOptions>,
  options: TOptions,
): string | null {
  return contractCase.skip?.(options) ?? null;
}

/** Register every applicable case of a contract as a vitest suite. */
export function describeContract<TOptions>(
  suite: string,
  cases: readonly ContractCase<TOptions>[],
  options: TOptions,
): void {
  describe(suite, () => {
    for (const contractCase of cases) {
      const reason = skipReason(contractCase, options);
      if (reason === null) {
        test(contractCase.name, () => contractCase.run(options));
      } else {
        test.skip(`${contractCase.name} — ${reason}`, () => undefined);
      }
    }
  });
}

/**
 * Names of the applicable cases a factory fails. Guard tests use it to assert
 * a deliberately broken implementation is caught, which is the only way to
 * know a passing suite means anything.
 */
export async function failingCases<TOptions>(
  cases: readonly ContractCase<TOptions>[],
  options: TOptions,
): Promise<string[]> {
  const failed: string[] = [];
  for (const contractCase of cases) {
    if (skipReason(contractCase, options) !== null) continue;
    try {
      await contractCase.run(options);
    } catch {
      failed.push(contractCase.name);
    }
  }
  return failed;
}

/** One page of a listing, in the shape both list-shaped ports reduce to. */
export interface KeyPage {
  readonly keys: readonly string[];
  readonly cursor?: string;
  readonly complete: boolean;
}

/**
 * Page a listing to exhaustion, failing on a key seen twice so a backend whose
 * cursor restarts the scan — the classic Redis SCAN clamp — is caught here
 * rather than by a caller that silently processes a key a second time.
 */
export async function drainKeys(
  page: (cursor: string | undefined) => Promise<KeyPage>,
): Promise<string[]> {
  const seen: string[] = [];
  let cursor: string | undefined;
  // Bounded so a cursor that never advances fails the case instead of hanging.
  for (let request = 0; request < 100; request++) {
    const result = await page(cursor);
    for (const key of result.keys) {
      expect(seen).not.toContain(key);
      seen.push(key);
    }
    if (result.complete) return seen.sort();
    expect(result.cursor).toBeTypeOf("string");
    cursor = result.cursor;
  }
  throw new Error("the listing never reported itself complete");
}
