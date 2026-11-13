import type { Executor } from "./gates.js";

/**
 * The coordinator checks each station's handoff in code. A read-only station
 * (analyst, reviewer) hands over a verdict on the commit it was given; its
 * edits are thrown away, so what was judged is what ships.
 */
const headOf = async (sandbox: Executor): Promise<string> =>
  (await sandbox.exec("git rev-parse HEAD")).stdout.trim();

const leftAlone = async (sandbox: Executor, head: string): Promise<boolean> =>
  (await sandbox.exec("git status --porcelain")).stdout.trim() === "" &&
  (await headOf(sandbox)) === head;

const restore = async (sandbox: Executor, head: string): Promise<void> => {
  await sandbox.exec(`git reset -q --hard ${head} && git clean -fdq`);
};

/** Runs a read-only phase, discarding its edits and running it again up to `attempts` times. */
export const readOnly = async <T>(
  sandbox: Executor,
  run: () => Promise<T>,
  attempts: number,
): Promise<{ result: T | null; discarded: number }> => {
  const head = await headOf(sandbox);
  for (let attempt = 0; attempt < attempts; attempt++) {
    const result = await run();
    if (await leftAlone(sandbox, head)) return { result, discarded: attempt };
    await restore(sandbox, head);
  }
  return { result: null, discarded: attempts };
};

const CITED_PATH = /(?:^|[\s`(])((?:[\w.@-]+\/)+[\w.@-]+\.\w+)(?=[:\s`),]|$)/g;

/** The files an analyst cites as evidence that the repository does not have. */
export const missingCitedPaths = async (
  evidence: readonly string[],
  exists: (path: string) => Promise<boolean>,
): Promise<string[]> => {
  const cited = new Set(
    evidence.flatMap((entry) =>
      [...entry.matchAll(CITED_PATH)].map(([, path]) => path as string),
    ),
  );
  const missing: string[] = [];
  for (const path of cited) if (!(await exists(path))) missing.push(path);
  return missing;
};
