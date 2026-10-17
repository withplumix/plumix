export interface LineRange {
  readonly start: number;
  readonly end: number;
}

const HUNK = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm;

/** The new-side lines a `git diff -U0` adds or changes. */
export function changedRanges(diff: string): LineRange[] {
  const ranges: LineRange[] = [];
  for (const hunk of diff.matchAll(HUNK)) {
    const start = Number(hunk[1]);
    const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
    if (count === 0) continue;
    const end = start + count - 1;
    const last = ranges.at(-1);
    if (last !== undefined && start <= last.end + 1)
      ranges[ranges.length - 1] = { start: last.start, end };
    else ranges.push({ start, end });
  }
  return ranges;
}

const SOURCE = /^src\/.+\.tsx?$/;
const NOT_SOURCE = /\.(test|spec)\.tsx?$|\.d\.ts$/;
/** Other packages' suites assert the test kit, and a package's own run never reaches them. */
const TEST_KIT = "src/test/";

/** Whether a package-relative path is source a run should mutate. */
export function isMutable(file: string): boolean {
  return (
    SOURCE.test(file) && !NOT_SOURCE.test(file) && !file.startsWith(TEST_KIT)
  );
}
